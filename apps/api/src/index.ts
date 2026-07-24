// Must be the first import — see loadEnv.ts for why.
import './loadEnv.js';

import express from 'express';
import cors from 'cors';
import { basicAuth } from './middleware/basicAuth.js';
import { firebaseAuth } from './middleware/firebaseAuth.js';
import { devModeMiddleware } from './middleware/devMode.js';
import { geocodeRouter } from './routes/geocode.js';
import { propertyRouter } from './routes/property.js';
import { providersRouter } from './routes/providers.js';
import { dealsRouter } from './routes/deals.js';
import { loiRouter } from './routes/loi.js';
import { loiDraftsRouter } from './routes/loiDrafts.js';
import { hotspotsRouter } from './routes/hotspots.js';
import { followupRouter } from './routes/followup.js';
import { landRouter } from './routes/land.js';
import { portfolioRouter } from './routes/portfolio.js';
import { sosRouter } from './routes/sos.js';
import { marketsRouter } from './routes/markets.js';
import { filingsRouter } from './routes/filings.js';
import { crmRouter } from './routes/crm.js';
import { postgridRouter } from './routes/postgrid.js';
import { stripeWebhooksRouter } from './routes/stripeWebhooks.js';
import { smsRouter, smsInboundRouter } from './routes/sms.js';
import { billingRouter } from './routes/billing.js';
import { invoicesRouter } from './routes/invoices.js';
import { terminalRouter } from './routes/terminal.js';
import { connectRouter } from './routes/connect.js';
import { adminRouter } from './routes/admin.js';
import { warmHotspots } from './providers/neighborhoods.js';
import { warmDenverPortfolio } from './providers/denverPortfolio.js';
import { supportedNeighborhoodMarkets } from './config/markets.js';

const app = express();

// CORS: allow the integrated TalkStudio frontend + the legacy
// re.talkstud.io frontend to call us. Authorization header must be
// explicitly allowed for Bearer tokens to flow through preflight.
//
// Configurable via CORS_ALLOWED_ORIGINS (comma-separated) for staging or
// other envs. Default list covers prod talkstudio + local dev.
const DEFAULT_ALLOWED = [
  'https://talkstud.io',
  'https://www.talkstud.io',
  'https://re.talkstud.io',
  'https://mfa-web.fly.dev',
  'https://smartinvestorcrm.com',
  'https://www.smartinvestorcrm.com',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
];
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ALLOWED);
app.use(
  cors({
    origin: (origin, cb) => {
      // No origin header = same-origin or curl/server — always allow.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-mfa-dev-mode'],
  })
);

// Stripe webhooks need the raw request body for signature verification, so
// this router (which applies express.raw() itself) must be mounted before
// the global express.json() below, and before the firebaseAuth/basicAuth
// gate — Stripe calls this endpoint directly, not through a signed-in user.
app.use('/api/webhooks', stripeWebhooksRouter);

// Twilio inbound SMS webhook — like Stripe's, it's called by Twilio (not a
// signed-in user), so it mounts before the auth gate. Authenticity comes
// from X-Twilio-Signature validation inside the route.
app.use('/api/sms', smsInboundRouter);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mfa-api', ts: new Date().toISOString() });
});

// Auth middleware order:
//   1. firebaseAuth — preferred (signs in via Google through TalkStudio).
//      Verifies a Bearer ID token and short-circuits with 401 on failure.
//   2. basicAuth    — legacy fallback for the standalone re.talkstud.io
//      basic-auth gate. Skipped automatically when AUTH_MODE=firebase.
//
// Set AUTH_MODE=firebase in production to drop basic-auth entirely.
// Default 'both' keeps backward compat: basic-auth requests still work
// during the transition window.
const authMode = (process.env.AUTH_MODE ?? 'both').toLowerCase();
if (authMode === 'firebase') {
  app.use(firebaseAuth);
} else if (authMode === 'basic') {
  app.use(basicAuth);
} else {
  // 'both' — try firebase first; if no Bearer header present, fall through
  // to basic auth so existing browser logins keep working.
  app.use(async (req, res, next) => {
    if (req.path === '/health') return next();
    const hasBearer = (req.header('authorization') ?? '').startsWith('Bearer ');
    if (hasBearer) return firebaseAuth(req, res, next);
    return basicAuth(req, res, next);
  });
}
app.use(devModeMiddleware);

app.use('/api/geocode', geocodeRouter);
app.use('/api/property', propertyRouter);
app.use('/api/providers', providersRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/loi/drafts', loiDraftsRouter);
app.use('/api/loi', loiRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/followup', followupRouter);
app.use('/api/land', landRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/sos', sosRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/filings', filingsRouter);
app.use('/api/crm', crmRouter);
app.use('/api/postgrid', postgridRouter);
app.use('/api/sms', smsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/connect', connectRouter);
app.use('/api/admin', adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
  // Warm every neighborhoodsSupported market's hotspots cache in the
  // background so first user request is served from cache. Staggered so
  // they don't all hit api.census.gov in the same instant (each market's
  // own neighborhoods are still scored one-at-a-time internally — see
  // neighborhoods.ts).
  supportedNeighborhoodMarkets().forEach((m, i) => {
    setTimeout(() => warmHotspots(m.key), 500 + i * 2000);
  });
  // Portfolio warm-up stays Denver-only until another market's bulk
  // parcel source is real (see portfolioDispatcher.ts).
  setTimeout(() => warmDenverPortfolio(), 500 + supportedNeighborhoodMarkets().length * 2000 + 1000);
});
