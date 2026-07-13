# Stripe billing setup

Real subscription checkout for the Pro/Team plans (apps/crm/src/types/plan.ts).
Free-plan signup needs none of this — it's untouched.

## Architecture

- **Plan/subscription state lives in Postgres**, not Firestore — see
  `billing_accounts` (db/migrations/007_stripe.sql) and
  `apps/api/src/db/billingAccountsRepo.ts`, keyed on the Firebase UID (auth
  stays Firebase; only billing state moved to Postgres).
- **Checkout**: `apps/crm` calls `POST /api/billing/checkout-session`
  (Firebase-auth'd, body `{ plan: 'pro' | 'team' }`) → `apps/api` maps the
  plan to a Price ID server-side (`STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM` env
  vars — the client never supplies a raw price ID) → creates a Stripe
  Checkout Session (`mode: 'subscription'`) → browser redirects to
  Stripe-hosted checkout.
- **Webhook**: `POST /api/webhooks/stripe` on `mfa-api` — registered in
  `apps/api/src/routes/stripeWebhooks.ts` with `express.raw()` ahead of both
  the global `express.json()` and the auth gate, since Stripe sends neither
  JSON nor a Firebase/basic-auth header, only a `stripe-signature` header.
  Updates `billing_accounts` on `customer.subscription.*` events.
- **Self-service management**: `POST /api/billing/portal-session` opens a
  Stripe Billing Portal session for an existing customer (upgrade/downgrade/
  cancel/update card) — surfaced as "Manage billing" on
  `/app/settings/billing` (`apps/crm/src/pages/BillingSettings.tsx`), which
  reuses the same `PricingGrid`/`PLAN_TIERS` as the public landing page.
- There's also a separate, v2-Accounts-API-based **Connect** integration
  (`apps/api/src/routes/connect.ts`) for investors accepting their *own*
  payments — unrelated to this subscription flow; see that file's comments.

## What you need to set up (real Stripe account)

1. **Create two recurring Prices** in the Stripe Dashboard (test mode first,
   then live): Pro at $79/mo, Team at $199/mo — matching
   `apps/crm/src/types/plan.ts`'s `PLAN_TIERS`. Copy each Price ID (`price_...`).
2. **Create a restricted API key** (Developers → API keys → Create restricted
   key) scoped to: Checkout Sessions (write), Billing Portal Sessions (write),
   Customers (read/write), Subscriptions (read), Invoices (read/write),
   Connect v2 Accounts (if using Connect), Terminal (if using Terminal). Per
   Stripe's own security guidance, prefer this `rk_...` key over the full
   secret key.
3. **Register the webhook endpoint**: Developers → Webhooks → Add endpoint →
   `https://mfa-api.fly.dev/api/webhooks/stripe`, listening for at minimum:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

   Copy the endpoint's signing secret (`whsec_...`).
4. **Set the following as Fly secrets on `mfa-api`** — do this yourself,
   don't paste key values into chat:
   ```bash
   fly secrets set --app mfa-api \
     STRIPE_SECRET_KEY="rk_live_..." \
     STRIPE_WEBHOOK_SECRET="whsec_..." \
     STRIPE_PRICE_PRO="price_..." \
     STRIPE_PRICE_TEAM="price_..." \
     APP_BASE_URL="https://smartinvestorcrm.com"
   ```
5. **Actually deploy** — merging to `main` does NOT deploy `mfa-api`; there's
   no CI/CD wired up. Run `fly deploy -c fly.api.toml` (or however you deploy
   the API) after setting secrets, or none of this will be reachable.

## Verifying

1. Sign up choosing a paid plan (`/sign-up?plan=pro`) — should redirect to a
   real Stripe Checkout page after account creation, not straight to `/app`.
2. Complete checkout with a Stripe test card (`4242 4242 4242 4242`, any
   future expiry/CVC) — lands back on `/app/settings?billing=success`.
3. Confirm the `billing_accounts` row (Postgres) picks up `subscription_id`,
   `subscription_status: 'active'`, `price_id`, `current_period_end` within a
   few seconds (webhook delivery, not instant) —
   `SELECT * FROM app.billing_accounts WHERE firebase_uid = '<uid>';`
4. Click "Manage billing" on the Billing settings page — should open the
   Stripe Customer Portal for that customer.
5. Cancel the subscription from the portal — confirm the webhook flips
   `subscription_status` to `canceled` in Postgres.
