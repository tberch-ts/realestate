import { pool } from './pool.js';

export interface BillingAccount {
  id: number;
  firebase_uid: string;
  email: string | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  stripe_connect_account_id: string | null;
  connect_capability_status: string;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateBillingAccount(firebaseUid: string, email?: string | null): Promise<BillingAccount> {
  const res = await pool.query<BillingAccount>(
    `INSERT INTO billing_accounts (firebase_uid, email)
     VALUES ($1, $2)
     ON CONFLICT (firebase_uid) DO UPDATE SET email = COALESCE(EXCLUDED.email, billing_accounts.email)
     RETURNING *`,
    [firebaseUid, email ?? null],
  );
  return res.rows[0];
}

export async function getBillingAccountByUid(firebaseUid: string): Promise<BillingAccount | null> {
  const res = await pool.query<BillingAccount>(`SELECT * FROM billing_accounts WHERE firebase_uid = $1`, [firebaseUid]);
  return res.rows[0] ?? null;
}

// Admin panel use: batch lookup for a page of Firebase Auth users, and a
// full dump for stats aggregation (plan breakdown, MRR estimate).
export async function getBillingAccountsByUids(firebaseUids: string[]): Promise<BillingAccount[]> {
  if (firebaseUids.length === 0) return [];
  const res = await pool.query<BillingAccount>(`SELECT * FROM billing_accounts WHERE firebase_uid = ANY($1::text[])`, [
    firebaseUids,
  ]);
  return res.rows;
}

export async function listAllBillingAccounts(): Promise<BillingAccount[]> {
  const res = await pool.query<BillingAccount>(`SELECT * FROM billing_accounts`);
  return res.rows;
}

export async function getBillingAccountByCustomerId(stripeCustomerId: string): Promise<BillingAccount | null> {
  const res = await pool.query<BillingAccount>(`SELECT * FROM billing_accounts WHERE stripe_customer_id = $1`, [
    stripeCustomerId,
  ]);
  return res.rows[0] ?? null;
}

export async function getBillingAccountByConnectAccountId(connectAccountId: string): Promise<BillingAccount | null> {
  const res = await pool.query<BillingAccount>(`SELECT * FROM billing_accounts WHERE stripe_connect_account_id = $1`, [
    connectAccountId,
  ]);
  return res.rows[0] ?? null;
}

export async function setStripeCustomerId(firebaseUid: string, stripeCustomerId: string): Promise<void> {
  await pool.query(
    `UPDATE billing_accounts SET stripe_customer_id = $2, updated_at = now() WHERE firebase_uid = $1`,
    [firebaseUid, stripeCustomerId],
  );
}

export async function updateSubscription(
  stripeCustomerId: string,
  fields: { subscriptionId: string | null; status: string | null; priceId: string | null; currentPeriodEnd: string | null },
): Promise<void> {
  await pool.query(
    `UPDATE billing_accounts
     SET subscription_id = $2, subscription_status = $3, price_id = $4, current_period_end = $5, updated_at = now()
     WHERE stripe_customer_id = $1`,
    [stripeCustomerId, fields.subscriptionId, fields.status, fields.priceId, fields.currentPeriodEnd],
  );
}

export async function setConnectAccountId(firebaseUid: string, connectAccountId: string): Promise<void> {
  await pool.query(
    `UPDATE billing_accounts SET stripe_connect_account_id = $2, updated_at = now() WHERE firebase_uid = $1`,
    [firebaseUid, connectAccountId],
  );
}

export async function updateConnectCapabilityStatus(connectAccountId: string, status: string): Promise<void> {
  await pool.query(
    `UPDATE billing_accounts SET connect_capability_status = $2, updated_at = now() WHERE stripe_connect_account_id = $1`,
    [connectAccountId, status],
  );
}
