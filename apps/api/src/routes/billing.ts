import { Router, type Request, type Response, type NextFunction } from 'express';
import { stripe } from '../stripe/client.js';
import {
  getOrCreateBillingAccount,
  getBillingAccountByUid,
  setStripeCustomerId,
} from '../db/billingAccountsRepo.js';

// SmartInvestorCRM's OWN subscription billing (the CRM charges its
// investor-customers a recurring fee to use the product). This is separate
// from Connect (routes/connect.ts), where those same customers accept their
// OWN payments from their own contacts.

export const billingRouter = Router();

function requireFirebaseUser(req: Request, res: Response, next: NextFunction): void {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Billing endpoints require a Firebase Bearer token.' });
    return;
  }
  next();
}

billingRouter.use(requireFirebaseUser);

// Plan -> Price ID mapping lives server-side, not in client-supplied input —
// the frontend sends a plan key ('pro'/'team'), never a raw Stripe price ID.
// Keeps the set of purchasable prices to an explicit allowlist instead of
// trusting whatever price ID a client happens to send.
// Exported for routes/admin.ts, which maps a billing_accounts.price_id back
// to a plan key for the Users list / stats dashboard — single source of
// truth instead of a second copy of this env-var mapping.
export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
};

async function getOrCreateStripeCustomerId(uid: string, email: string | null | undefined): Promise<string> {
  const account = await getOrCreateBillingAccount(uid, email);
  if (account.stripe_customer_id) return account.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { firebase_uid: uid },
  });
  await setStripeCustomerId(uid, customer.id);
  return customer.id;
}

billingRouter.get('/status', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    const activePriceId = account?.subscription_status === 'active' || account?.subscription_status === 'trialing'
      ? account.price_id
      : null;
    const plan = Object.entries(PLAN_PRICE_IDS).find(([, priceId]) => priceId && priceId === activePriceId)?.[0] ?? 'free';
    res.json({
      plan,
      subscriptionStatus: account?.subscription_status ?? null,
      currentPeriodEnd: account?.current_period_end ?? null,
      hasStripeCustomer: Boolean(account?.stripe_customer_id),
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.post('/checkout-session', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const email = req.firebaseUser!.email ?? null;
    const plan = req.body?.plan as string | undefined;
    const priceId = plan ? PLAN_PRICE_IDS[plan] : undefined;
    if (!plan || !(plan in PLAN_PRICE_IDS)) {
      res.status(400).json({ error: 'invalid_plan', message: `plan must be one of: ${Object.keys(PLAN_PRICE_IDS).join(', ')}` });
      return;
    }
    if (!priceId) {
      res.status(503).json({ error: 'plan_not_configured', message: `STRIPE_PRICE_${plan.toUpperCase()} is not set on the server.` });
      return;
    }

    const customerId = await getOrCreateStripeCustomerId(uid, email);
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5174';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      // Do NOT set payment_method_types — Stripe determines eligible methods
      // dynamically from Dashboard settings + customer signals.
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      // A brand-new Customer has no address on file, and automatic_tax
      // requires one to calculate against. 'auto' tells Checkout to collect
      // the billing address during checkout and save it back to the
      // Customer — without this, every first-time subscriber 400s with
      // customer_tax_location_invalid.
      customer_update: { address: 'auto', name: 'auto' },
      success_url: `${baseUrl}/settings?billing=success`,
      cancel_url: `${baseUrl}/settings?billing=canceled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

billingRouter.post('/portal-session', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    if (!account?.stripe_customer_id) {
      res.status(404).json({ error: 'no_stripe_customer', message: 'Subscribe first via /checkout-session.' });
      return;
    }

    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5174';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${baseUrl}/settings`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    next(err);
  }
});
