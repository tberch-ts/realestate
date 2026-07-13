import express, { Router } from 'express';
import type Stripe from 'stripe';
import { stripe } from '../stripe/client.js';
import { updateSubscription } from '../db/billingAccountsRepo.js';
import { updateConnectCapabilityStatus } from '../db/billingAccountsRepo.js';

// Two separate Stripe event systems, two separate verification paths:
//
//   /stripe     - classic v1 webhooks (snapshot events: checkout, subscription,
//                 invoice). Verified with stripe.webhooks.constructEvent +
//                 STRIPE_WEBHOOK_SECRET (from `stripe listen` or Dashboard).
//   /stripe-v2  - v2 thin events (Connect account/capability status changes).
//                 Verified with stripe.parseEventNotification +
//                 STRIPE_V2_WEBHOOK_SECRET (from the one-off event destination
//                 setup script — see stripe/scripts/setupEventDestination.ts).
//
// Both need the raw request body for signature verification, so this router
// must be mounted in index.ts BEFORE the global express.json() middleware.

export const stripeWebhooksRouter = Router();

stripeWebhooksRouter.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — rejecting');
    res.status(500).send('webhook not configured');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature ?? '', secret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', (err as Error).message);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const item = sub.items.data[0];
        await updateSubscription(customerId, {
          subscriptionId: sub.id,
          status: sub.status,
          priceId: item?.price?.id ?? null,
          currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
        });
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Subscription status transitions (past_due, active again, etc.) arrive
        // via customer.subscription.updated above — nothing extra to persist
        // here yet. Hook point for dunning emails / in-app banners later.
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    // Still ack with 200 below — Stripe retries non-2xx responses, and a bug
    // in our handler shouldn't trigger a redelivery storm. Log and fix forward.
  }

  res.json({ received: true });
});

stripeWebhooksRouter.post('/stripe-v2', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('stripe-signature');
  const secret = process.env.STRIPE_V2_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook-v2] STRIPE_V2_WEBHOOK_SECRET not set — rejecting');
    res.status(500).send('webhook not configured');
    return;
  }

  let notification;
  try {
    notification = stripe.parseEventNotification(req.body, signature ?? '', secret);
  } catch (err) {
    console.error('[stripe-webhook-v2] signature verification failed:', (err as Error).message);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    switch (notification.type) {
      case 'v2.core.account[configuration.merchant].capability_status_updated':
      case 'v2.core.account.updated': {
        const account = await notification.fetchRelatedObject();
        const status = account.configuration?.merchant?.capabilities?.card_payments?.status ?? 'unset';
        await updateConnectCapabilityStatus(account.id, status);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook-v2] handler error for ${notification.type}:`, err);
  }

  res.json({ received: true });
});
