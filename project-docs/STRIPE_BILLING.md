# Stripe billing setup

Real subscription checkout for the Pro/Team plans (apps/crm/src/types/plan.ts).
Free-plan signup needs none of this — it's untouched.

## Architecture

- **Checkout**: `apps/crm` calls `POST /api/billing/checkout` (Firebase-auth'd)
  → `apps/api` creates a Stripe Checkout Session (`mode: 'subscription'`) →
  browser redirects to Stripe-hosted checkout.
- **Plan is server-authoritative**: the Firestore `users/{uid}` doc's `plan`,
  `planStatus`, `stripeCustomerId`, `stripeSubscriptionId` fields can only be
  written by the webhook handler (via the Admin SDK, which bypasses
  `firestore.rules`). A client can create its own profile only with
  `plan: 'free'` and can never edit those fields directly — see
  `firestore.rules`'s `users/{uid}` rule.
- **Webhook**: `POST /api/billing/webhook` on `mfa-api` — registered in
  `apps/api/src/index.ts` with `express.raw()` ahead of both the global
  `express.json()` and the auth gate, since Stripe sends neither JSON nor a
  Firebase/basic-auth header, only a `stripe-signature` header.
- **Self-service management**: `POST /api/billing/portal` opens a Stripe
  Billing Portal session for an existing customer (upgrade/downgrade/cancel/
  update card) — surfaced as "Manage billing" on `/app/settings/billing`
  (`apps/crm/src/pages/Billing.tsx`) once a user has a `stripeCustomerId`.

## What you need to set up (real Stripe account)

1. **Create two recurring Prices** in the Stripe Dashboard (test mode first,
   then live): Pro at $79/mo, Team at $199/mo — matching
   `apps/crm/src/types/plan.ts`'s `PLAN_TIERS`. Copy each Price ID (`price_...`).
2. **Create a restricted API key** (Developers → API keys → Create restricted
   key) scoped to: Checkout Sessions (write), Billing Portal Sessions (write),
   Customers (read), Subscriptions (read). Per Stripe's own security guidance,
   prefer this `rk_...` key over the full secret key.
3. **Register the webhook endpoint**: Developers → Webhooks → Add endpoint →
   `https://mfa-api.fly.dev/api/billing/webhook`, listening for at minimum:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the endpoint's signing secret (`whsec_...`).
4. **Set the following as Fly secrets on `mfa-api`** — do this yourself,
   don't paste key values into chat:
   ```bash
   fly secrets set --app mfa-api \
     STRIPE_SECRET_KEY="rk_live_..." \
     STRIPE_WEBHOOK_SECRET="whsec_..." \
     STRIPE_PRICE_PRO="price_..." \
     STRIPE_PRICE_TEAM="price_..."
   ```
5. Redeploy `mfa-api` (`fly deploy -c fly.api.toml`) if it doesn't pick up
   secrets on next auto-start.

## Verifying

1. Sign up choosing a paid plan (`/sign-up?plan=pro`) — should redirect to a
   real Stripe Checkout page after account creation, not straight to `/app`.
2. Complete checkout with a Stripe test card (`4242 4242 4242 4242`, any
   future expiry/CVC) — lands back on `/app/settings/billing?checkout=success`.
3. Confirm the Firestore `users/{uid}` doc picks up `plan: 'pro'`,
   `planStatus: 'active'`, `stripeCustomerId`, `stripeSubscriptionId` within a
   few seconds (webhook delivery, not instant).
4. Click "Manage billing" on the Billing page — should open the Stripe
   Customer Portal for that customer.
5. Cancel the subscription from the portal — confirm the webhook flips
   `plan` back to `free` and `planStatus` to `canceled`.
6. Security check: try writing `plan: 'team'` directly to your own
   `users/{uid}` doc via the Firestore console or client SDK — should be
   rejected by `firestore.rules`.
