// One-off setup script: registers a v2 Event Destination so Stripe pushes
// Connect account/capability status changes (thin events) to our webhook.
// Classic v1 webhooks (customer.subscription.*, invoice.*) do NOT cover v2
// Accounts — that's a separate delivery system, hence this separate call.
//
// Run once per environment (test mode / live mode each need their own):
//   npx tsx src/stripe/scripts/setupEventDestination.ts <https://your-api-host>/api/webhooks/stripe-v2
//
// Prints the signing_secret exactly once — paste it into STRIPE_V2_WEBHOOK_SECRET.
// Re-running will create a DUPLICATE destination; check `stripe.v2.core.eventDestinations.list()`
// (or the Dashboard) first if unsure whether one already exists.

// Resolves .env from the monorepo root regardless of cwd — see
// db/migrate.ts for why plain `dotenv/config` (cwd-relative) isn't safe here.
import '../../loadEnv.js';
import { stripe } from '../client.js';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx src/stripe/scripts/setupEventDestination.ts <webhook-url>');
    console.error('Example: npx tsx src/stripe/scripts/setupEventDestination.ts http://localhost:4000/api/webhooks/stripe-v2');
    process.exit(1);
  }

  const destination = await stripe.v2.core.eventDestinations.create({
    name: 'smartinvestorcrm-connect-status',
    type: 'webhook_endpoint',
    event_payload: 'thin',
    enabled_events: [
      'v2.core.account.updated',
      'v2.core.account[configuration.merchant].capability_status_updated',
      'v2.core.account[configuration.merchant].updated',
    ],
    // @self: events on our own platform account. @accounts: events on the
    // connected (investor) accounts we manage — this is the one we actually
    // need, since capability status changes happen on THEIR account, not ours.
    events_from: ['@self', '@accounts'],
    webhook_endpoint: { url },
    // Without this, webhook_endpoint.signing_secret comes back null — it's
    // only returned when explicitly requested, even on creation.
    include: ['webhook_endpoint.signing_secret'],
  });

  console.log('Event destination created:', destination.id);
  console.log('Signing secret (save this — shown only once):');
  console.log(destination.webhook_endpoint?.signing_secret);
  console.log('\nSet STRIPE_V2_WEBHOOK_SECRET to the value above in .env');
}

main().catch((err) => {
  console.error('Failed to create event destination:', err);
  process.exit(1);
});
