import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — Stripe routes will 500 until configured.');
}

// Pin the API version explicitly rather than trusting the SDK default, so a
// future `npm install stripe@latest` can't silently change request/response
// shapes underneath us.
export const stripe = new Stripe(secretKey ?? 'sk_test_placeholder', {
  apiVersion: '2026-06-24.dahlia',
});

export function requireStripe(): Stripe {
  if (!secretKey) {
    throw Object.assign(new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)'), {
      statusCode: 503,
    });
  }
  return stripe;
}
