// Stripe billing — subscription Checkout, self-service Billing Portal, and
// the webhook that's the *only* thing allowed to set a user's plan.
//
// Required env (Fly secrets, never committed):
//   STRIPE_SECRET_KEY    — restricted key with Checkout Session, Billing
//                           Portal Session, and Subscription read/write scopes.
//   STRIPE_WEBHOOK_SECRET — signing secret for the endpoint registered below.
//   STRIPE_PRICE_PRO      — Price ID for the Pro plan (recurring).
//   STRIPE_PRICE_TEAM     — Price ID for the Team plan (recurring).
//
// Register the webhook in the Stripe Dashboard pointing at
// https://mfa-api.fly.dev/api/billing/webhook, listening for at least:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted

import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../middleware/firebaseAuth.js';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
};

function usersCollection() {
  const app = getAdminApp();
  if (!app) throw new Error('Firebase Admin SDK not configured');
  return getFirestore(app).collection('users');
}

export const billingRouter = Router();

billingRouter.post('/checkout', async (req: Request, res: Response) => {
  const uid = req.firebaseUser?.uid;
  const email = req.firebaseUser?.email;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: 'stripe_not_configured', message: 'STRIPE_SECRET_KEY is not set.' });
    return;
  }

  const plan = String((req.body as { plan?: string })?.plan ?? '');
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    res.status(400).json({ error: 'invalid_plan', message: `No price configured for plan "${plan}".` });
    return;
  }

  const origin = req.header('origin') ?? 'https://smartinvestorcrm.com';
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: uid,
      customer_email: email,
      subscription_data: { metadata: { firebaseUid: uid } },
      metadata: { firebaseUid: uid, plan },
      success_url: `${origin}/app/settings/billing?checkout=success`,
      cancel_url: `${origin}/app/settings/billing?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(502).json({ error: 'stripe_error', message: (e as Error).message });
  }
});

billingRouter.post('/portal', async (req: Request, res: Response) => {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: 'stripe_not_configured', message: 'STRIPE_SECRET_KEY is not set.' });
    return;
  }

  try {
    const doc = await usersCollection().doc(uid).get();
    const customerId = doc.data()?.stripeCustomerId as string | undefined;
    if (!customerId) {
      res.status(400).json({ error: 'no_customer', message: 'Upgrade to a paid plan before managing billing.' });
      return;
    }
    const origin = req.header('origin') ?? 'https://smartinvestorcrm.com';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/app/settings/billing`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(502).json({ error: 'stripe_error', message: (e as Error).message });
  }
});

// Mounted separately in index.ts with a raw-body parser, ahead of the global
// express.json() and the firebase/basic auth gate — Stripe can't send either.
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.header('stripe-signature');
  if (!stripe || !whSecret) {
    res.status(503).send('Stripe webhook not configured');
    return;
  }
  if (!signature) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, whSecret);
  } catch (e) {
    res.status(400).send(`Webhook signature verification failed: ${(e as Error).message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.metadata?.firebaseUid ?? session.client_reference_id ?? undefined;
        const plan = session.metadata?.plan;
        if (uid && plan) {
          await usersCollection().doc(uid).set(
            {
              plan,
              planStatus: 'active',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
            },
            { merge: true }
          );
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.firebaseUid;
        if (uid) {
          const active = event.type === 'customer.subscription.updated' && (sub.status === 'active' || sub.status === 'trialing');
          await usersCollection().doc(uid).set(
            {
              planStatus: sub.status,
              ...(active ? {} : { plan: 'free' }),
            },
            { merge: true }
          );
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[billing webhook] handler error:', (e as Error).message);
    res.status(500).json({ error: 'webhook_handler_failed' });
  }
}
