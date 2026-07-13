-- Stripe integration: one row per Firebase-authenticated CRM user, tracking
-- both sides of the relationship:
--   - stripe_customer_id / subscription_* : SmartInvestorCRM's OWN billing
--     (this user is a paying subscriber of the CRM itself; SmartInvestorCRM
--     is the merchant of record here).
--   - stripe_connect_account_id / connect_* : the user's OWN Stripe Connect
--     v2 merchant account, used when THEY accept payments from their own
--     contacts (earnest money, rent, application fees). The user is the
--     merchant of record for that money; we never touch it.
--
-- There's no local `users` table (auth is Firebase-only — see
-- middleware/firebaseAuth.ts), so this is keyed directly on firebase_uid.

CREATE TABLE IF NOT EXISTS billing_accounts (
  id                          BIGSERIAL PRIMARY KEY,
  firebase_uid                TEXT NOT NULL UNIQUE,
  email                       TEXT,

  -- SmartInvestorCRM's own billing (Billing + Invoicing products)
  stripe_customer_id          TEXT UNIQUE,
  subscription_id             TEXT,
  subscription_status         TEXT
                                CHECK (subscription_status IN (
                                  'incomplete','incomplete_expired','trialing','active',
                                  'past_due','canceled','unpaid','paused'
                                )),
  price_id                    TEXT,
  current_period_end          TIMESTAMPTZ,

  -- The user's own Connect v2 merchant account (direct charges; they are MoR)
  stripe_connect_account_id   TEXT UNIQUE,
  -- 'unset' is our own sentinel (no Connect account yet); the rest mirror
  -- Stripe's v2 CardPayments capability Status enum exactly.
  connect_capability_status   TEXT NOT NULL DEFAULT 'unset'
                                CHECK (connect_capability_status IN (
                                  'unset','pending','active','restricted','unsupported'
                                )),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_accounts_customer ON billing_accounts (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_connect   ON billing_accounts (stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_sub_status ON billing_accounts (subscription_status);
