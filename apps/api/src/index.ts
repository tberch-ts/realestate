import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Load .env from repo root (monorepo) regardless of npm workspace cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { basicAuth } from './middleware/basicAuth.js';
import { geocodeRouter } from './routes/geocode.js';
import { propertyRouter } from './routes/property.js';
import { providersRouter } from './routes/providers.js';
import { dealsRouter } from './routes/deals.js';
import { loiRouter } from './routes/loi.js';
import { loiDraftsRouter } from './routes/loiDrafts.js';
import { hotspotsRouter } from './routes/hotspots.js';
import { followupRouter } from './routes/followup.js';
import { portfolioRouter } from './routes/portfolio.js';
import { sosRouter } from './routes/sos.js';
import { marketsRouter } from './routes/markets.js';
import { filingsRouter } from './routes/filings.js';
import { crmRouter } from './routes/crm.js';
import { postgridRouter } from './routes/postgrid.js';
import { warmDenverHotspots } from './providers/denverNeighborhoods.js';
import { warmDenverPortfolio } from './providers/denverPortfolio.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mfa-api', ts: new Date().toISOString() });
});

app.use(basicAuth);

app.use('/api/geocode', geocodeRouter);
app.use('/api/property', propertyRouter);
app.use('/api/providers', providersRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/loi/drafts', loiDraftsRouter);
app.use('/api/loi', loiRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/followup', followupRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/sos', sosRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/filings', filingsRouter);
app.use('/api/crm', crmRouter);
app.use('/api/postgrid', postgridRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
  // Warm Denver hotspots + portfolio in background so first user request is served from cache.
  setTimeout(() => warmDenverHotspots(), 500);
  setTimeout(() => warmDenverPortfolio(), 1500);
});
