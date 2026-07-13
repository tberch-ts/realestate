import { Router, type Request, type Response, type NextFunction } from 'express';
import { stripe } from '../stripe/client.js';
import { getOrCreateBillingAccount, getBillingAccountByUid, setStripeCustomerId } from '../db/billingAccountsRepo.js';

// Ad hoc Stripe Invoices for SmartInvestorCRM's own billing — onboarding
// fees, custom services, anything outside the recurring subscription.
// Stripe is the system of record (no local invoices table); we just proxy
// create/list/send calls scoped to the caller's own Stripe customer.

export const invoicesRouter = Router();

function requireFirebaseUser(req: Request, res: Response, next: NextFunction): void {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Invoicing endpoints require a Firebase Bearer token.' });
    return;
  }
  next();
}

invoicesRouter.use(requireFirebaseUser);

async function getOrCreateStripeCustomerId(uid: string, email: string | null | undefined): Promise<string> {
  const account = await getOrCreateBillingAccount(uid, email);
  if (account.stripe_customer_id) return account.stripe_customer_id;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { firebase_uid: uid } });
  await setStripeCustomerId(uid, customer.id);
  return customer.id;
}

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const account = await getBillingAccountByUid(uid);
    if (!account?.stripe_customer_id) {
      res.json({ data: [] });
      return;
    }
    const invoices = await stripe.invoices.list({ customer: account.stripe_customer_id, limit: 50 });
    res.json({ data: invoices.data });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const email = req.firebaseUser!.email ?? null;
    const { description, amountCents, currency, daysUntilDue } = req.body as {
      description?: string;
      amountCents?: number;
      currency?: string;
      daysUntilDue?: number;
    };
    if (!description || !amountCents || amountCents <= 0) {
      res.status(400).json({ error: 'description and a positive amountCents are required' });
      return;
    }

    const customerId = await getOrCreateStripeCustomerId(uid, email);

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(amountCents),
      currency: currency ?? 'usd',
      description,
    });

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue ?? 14,
      automatic_tax: { enabled: true },
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    const sent = await stripe.invoices.sendInvoice(finalized.id);

    res.status(201).json(sent);
  } catch (err) {
    next(err);
  }
});
