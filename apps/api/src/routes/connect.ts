import { Router, type Request, type Response, type NextFunction } from 'express';
import { stripe } from '../stripe/client.js';
import {
  getOrCreateBillingAccount,
  getBillingAccountByUid,
  setConnectAccountId,
  updateConnectCapabilityStatus,
} from '../db/billingAccountsRepo.js';

// Stripe Connect for investors: SmartInvestorCRM is SOFTWARE that lets each
// investor accept their own payments (earnest money, application fees, rent)
// from their own contacts. The investor is the merchant of record — this is
// Stripe's "SaaS platform with payments" pattern:
//   - Accounts v2 API only (never v1 type: 'express'/'custom'/'standard')
//   - configuration.merchant + card_payments capability
//   - dashboard: 'full' (investor gets the real Stripe Dashboard)
//   - fees_collector / losses_collector: 'stripe' (investor bears their own
//     Stripe fees and dispute liability, matching dashboard: 'full')
//   - Direct charges: PaymentIntent created ON the connected account, with
//     application_fee_amount for SmartInvestorCRM's platform cut.

export const connectRouter = Router();

function requireFirebaseUser(req: Request, res: Response, next: NextFunction): void {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Connect endpoints require a Firebase Bearer token.' });
    return;
  }
  next();
}

connectRouter.use(requireFirebaseUser);

connectRouter.post('/account', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const email = req.firebaseUser!.email ?? null;
    const account = await getOrCreateBillingAccount(uid, email);
    if (account.stripe_connect_account_id) {
      res.json({ accountId: account.stripe_connect_account_id });
      return;
    }

    const displayName = req.body?.displayName as string | undefined;

    // Identity (legal name, address, SSN/EIN, etc.) is intentionally omitted
    // here — the account_onboarding embedded component (see
    // /onboarding-session below) collects it progressively from the
    // investor themselves, which is Stripe's recommended flow over
    // pre-filling identity via the API.
    const v2Account = await stripe.v2.core.accounts.create({
      contact_email: email ?? undefined,
      display_name: displayName,
      dashboard: 'full',
      configuration: {
        merchant: {
          capabilities: { card_payments: { requested: true } },
        },
      },
      defaults: {
        responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
      },
    });

    await setConnectAccountId(uid, v2Account.id);
    res.status(201).json({ accountId: v2Account.id });
  } catch (err) {
    next(err);
  }
});

// Returns a Stripe-hosted onboarding URL (the "Account Links" flow — the
// other Stripe-recommended default alongside embedded components, and the
// simpler one for a plain redirect-based frontend with no extra JS SDK).
// The investor completes KYC/bank details on Stripe's hosted page, then
// lands back on returnUrl; capability status updates arrive via the v2
// thin-event webhook (routes/stripeWebhooks.ts) and can also be re-checked
// with GET /status.
connectRouter.post('/onboarding-link', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    if (!account?.stripe_connect_account_id) {
      res.status(404).json({ error: 'no_connect_account', message: 'Create a Connect account first via POST /account.' });
      return;
    }

    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5174';
    const link = await stripe.v2.core.accountLinks.create({
      account: account.stripe_connect_account_id,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant'],
          return_url: `${baseUrl}/app/settings/billing?connect=return`,
          refresh_url: `${baseUrl}/app/settings/billing?connect=refresh`,
        },
      },
    });

    res.json({ url: link.url });
  } catch (err) {
    next(err);
  }
});

connectRouter.get('/status', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    if (!account?.stripe_connect_account_id) {
      res.json({ hasAccount: false, capabilityStatus: 'unset' });
      return;
    }

    // Re-check live status rather than trusting only the webhook-cached
    // value — webhooks can lag or (rarely) get missed.
    const v2Account = await stripe.v2.core.accounts.retrieve(account.stripe_connect_account_id, {
      include: ['configuration.merchant'],
    });
    const status = v2Account.configuration?.merchant?.capabilities?.card_payments?.status ?? 'unset';
    if (status !== account.connect_capability_status) {
      await updateConnectCapabilityStatus(account.stripe_connect_account_id, status);
    }

    res.json({ hasAccount: true, accountId: account.stripe_connect_account_id, capabilityStatus: status });
  } catch (err) {
    next(err);
  }
});

// Direct-charge PaymentIntent created ON the connected account — the
// investor is merchant of record for this money, we take a platform fee.
connectRouter.post('/payment-intents', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    if (!account?.stripe_connect_account_id) {
      res.status(404).json({ error: 'no_connect_account' });
      return;
    }
    if (account.connect_capability_status !== 'active') {
      res.status(409).json({
        error: 'capability_not_active',
        capabilityStatus: account.connect_capability_status,
        message: 'Finish Connect onboarding (GET /status) before accepting payments.',
      });
      return;
    }

    const { amountCents, currency, applicationFeeCents, description } = req.body as {
      amountCents?: number;
      currency?: string;
      applicationFeeCents?: number;
      description?: string;
    };
    if (!amountCents || amountCents <= 0) {
      res.status(400).json({ error: 'a positive amountCents is required' });
      return;
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amountCents),
        currency: currency ?? 'usd',
        description,
        // Do NOT set payment_method_types here — dynamic payment methods.
        application_fee_amount: applicationFeeCents ? Math.round(applicationFeeCents) : undefined,
      },
      { stripeAccount: account.stripe_connect_account_id },
    );

    res.status(201).json({ id: intent.id, clientSecret: intent.client_secret });
  } catch (err) {
    next(err);
  }
});
