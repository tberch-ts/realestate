// SmartInvestorCRM internal admin panel — user/subscription lookup, admin
// role grants, and cross-tenant platform stats. Every route here is gated by
// requireAdmin (the `admin` Firebase custom claim), mounted after the global
// auth middleware in index.ts.
//
// Deliberately backend-only for the parts that need cross-tenant reads
// (Firebase Auth user listing, Postgres billing_accounts, aggregate counts
// across every user's Firestore docs) — firestore.rules intentionally keeps
// deals/contacts/lois/capital_raises readable only by their owner/members,
// so an admin custom claim does NOT grant the client SDK cross-tenant read
// access. All of that goes through the Admin SDK here instead, verified
// server-side on every request. (market_signals is the one collection with
// an admin-write rule already in firestore.rules — see
// apps/crm/src/pages/admin/AdminMarketSignals.tsx, which writes it directly
// via the client SDK and doesn't need a route here.)
import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../middleware/firebaseAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getBillingAccountsByUids, listAllBillingAccounts, type BillingAccount } from '../db/billingAccountsRepo.js';
import { PLAN_PRICE_IDS } from './billing.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// Mirrors apps/crm/src/types/plan.ts PLAN_TIERS[*].price — kept as a small,
// explicit duplicate (like PLAN_PRICE_IDS was before being exported) rather
// than a cross-app import, since apps/crm's plan.ts is UI copy (taglines,
// feature lists) this route has no business depending on. Update both if
// pricing changes.
const PLAN_MONTHLY_PRICE: Record<string, number> = { free: 0, pro: 79, team: 199 };

function planForPriceId(priceId: string | null | undefined): string {
  if (!priceId) return 'free';
  const entry = Object.entries(PLAN_PRICE_IDS).find(([, id]) => id === priceId);
  return entry?.[0] ?? 'free';
}

function activePlan(account: BillingAccount | undefined): string {
  const isActive = account?.subscription_status === 'active' || account?.subscription_status === 'trialing';
  return isActive ? planForPriceId(account?.price_id) : 'free';
}

adminRouter.get('/users', async (req, res, next) => {
  try {
    const app = getAdminApp();
    if (!app) {
      res.status(503).json({ error: 'firebase_not_configured', message: 'Firebase Admin SDK not configured on the API.' });
      return;
    }
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 100, 1), 1000);
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined;

    const result = await getAuth(app).listUsers(pageSize, pageToken);
    const uids = result.users.map((u) => u.uid);
    const accounts = await getBillingAccountsByUids(uids);
    const accountByUid = new Map(accounts.map((a) => [a.firebase_uid, a]));

    const users = result.users.map((u) => {
      const account = accountByUid.get(u.uid);
      return {
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        disabled: u.disabled,
        admin: u.customClaims?.admin === true,
        createdAt: u.metadata.creationTime,
        lastSignInAt: u.metadata.lastSignInTime ?? null,
        plan: activePlan(account),
        subscriptionStatus: account?.subscription_status ?? null,
        currentPeriodEnd: account?.current_period_end ?? null,
      };
    });

    res.json({ users, nextPageToken: result.pageToken || undefined });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:uid/admin-claim', async (req, res, next) => {
  try {
    const app = getAdminApp();
    if (!app) {
      res.status(503).json({ error: 'firebase_not_configured', message: 'Firebase Admin SDK not configured on the API.' });
      return;
    }
    const { uid } = req.params;
    const admin = Boolean(req.body?.admin);

    // Guard against an admin locking themselves out. Anyone else can be
    // revoked by another admin, but not by themselves via this endpoint.
    if (!admin && uid === req.firebaseUser!.uid) {
      res.status(400).json({ error: 'cannot_self_revoke', message: 'You cannot revoke your own admin access.' });
      return;
    }

    const auth = getAuth(app);
    const target = await auth.getUser(uid); // 404s (auth/user-not-found) via the error handler below if uid is bogus
    await auth.setCustomUserClaims(uid, { ...target.customClaims, admin });

    // Custom claims only ride in on the NEXT ID token a client mints — an
    // already-issued token keeps its old claims for the rest of its ~1hr
    // lifetime otherwise. revokeRefreshTokens forces that immediately: with
    // checkRevoked=true in firebaseAuth.ts, any outstanding token for this
    // uid (issued before this call) is rejected on its very next request,
    // so a just-revoked admin can't keep using their old token — including
    // to call this same endpoint and grant themselves admin back.
    await auth.revokeRefreshTokens(uid);

    res.json({ uid, admin });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const app = getAdminApp();
    if (!app) {
      res.status(503).json({ error: 'firebase_not_configured', message: 'Firebase Admin SDK not configured on the API.' });
      return;
    }
    const auth = getAuth(app);

    // Firebase Auth has no cheap "count all users" call — page through.
    // Capped at 10 pages (10k users) since this is an early-stage product;
    // usersTruncated tells the UI to caveat the numbers if that cap is hit.
    const users: Array<{ uid: string; creationTime: string }> = [];
    let pageToken: string | undefined;
    let usersTruncated = false;
    for (let page = 0; page < 10; page++) {
      const result = await auth.listUsers(1000, pageToken);
      for (const u of result.users) users.push({ uid: u.uid, creationTime: u.metadata.creationTime });
      pageToken = result.pageToken || undefined;
      if (!pageToken) break;
      if (page === 9) usersTruncated = true;
    }

    const monthCounts = new Map<string, number>();
    for (const u of users) {
      // metadata.creationTime is formatted via Date.toUTCString() by the
      // Admin SDK (e.g. "Thu, 23 Jul 2026 00:00:00 GMT"), NOT ISO-8601 — a
      // plain slice(0, 7) would grab "Thu, 23" instead of a year-month.
      // Parse it properly and format as YYYY-MM ourselves.
      const d = new Date(u.creationTime);
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
    const signupsByMonth = Array.from(monthCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // Admin SDK bypasses firestore.rules, so this legitimately counts across
    // every user's docs — the one place in this app that does. count()
    // aggregation queries are billed as a single read each, not per-doc.
    const firestore = getFirestore(app);
    const collectionNames = ['deals', 'contacts', 'lois', 'capital_raises', 'builder_buy_boxes'] as const;
    const counts = await Promise.all(
      collectionNames.map(async (name) => {
        const snap = await firestore.collection(name).count().get();
        return snap.data().count;
      }),
    );
    const [deals, contacts, lois, capitalRaises, builderBuyBoxes] = counts;

    const accounts = await listAllBillingAccounts();
    const accountedUids = new Set(accounts.map((a) => a.firebase_uid));
    const planCounts = new Map<string, number>();
    let mrrEstimate = 0;
    for (const a of accounts) {
      const plan = activePlan(a);
      planCounts.set(plan, (planCounts.get(plan) ?? 0) + 1);
      mrrEstimate += PLAN_MONTHLY_PRICE[plan] ?? 0;
    }
    // Users who never touched billing (no billing_accounts row at all) are
    // implicitly on the free plan.
    const neverBilled = users.filter((u) => !accountedUids.has(u.uid)).length;
    planCounts.set('free', (planCounts.get('free') ?? 0) + neverBilled);

    res.json({
      userCount: users.length,
      usersTruncated,
      signupsByMonth,
      collections: { deals, contacts, lois, capitalRaises, builderBuyBoxes },
      planBreakdown: Array.from(planCounts.entries()).map(([plan, count]) => ({ plan, count })),
      mrrEstimate,
    });
  } catch (err) {
    next(err);
  }
});
