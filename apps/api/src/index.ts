import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { geocodeRouter } from './routes/geocode.js';
import { propertyRouter } from './routes/property.js';
import { providersRouter } from './routes/providers.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mfa-api', ts: new Date().toISOString() });
});

app.use('/api/geocode', geocodeRouter);
app.use('/api/property', propertyRouter);
app.use('/api/providers', providersRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
});
