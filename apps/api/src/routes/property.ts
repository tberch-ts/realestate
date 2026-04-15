import { Router } from 'express';
import { buildPropertySnapshot } from '../providers/index.js';
import { pool } from '../db/pool.js';

export const propertyRouter = Router();

propertyRouter.get('/', async (req, res, next) => {
  try {
    const address = String(req.query.address ?? '').trim();
    if (!address) return res.status(400).json({ error: 'address query param required' });

    const snapshot = await buildPropertySnapshot(address);

    // Best-effort persistence; do not block response on DB errors.
    persistSnapshot(address, snapshot).catch((e) => console.error('[property] persist failed:', e));

    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

async function persistSnapshot(address: string, snapshot: Awaited<ReturnType<typeof buildPropertySnapshot>>) {
  const geo = snapshot.geocode.status === 'ok' ? snapshot.geocode.data : undefined;
  const normalized = geo?.formatted ?? address.toLowerCase();

  const { rows } = await pool.query(
    `INSERT INTO properties (address, normalized, lat, lng)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (normalized) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [address, normalized, geo?.lat ?? null, geo?.lng ?? null]
  );
  const propertyId = rows[0].id;

  const entries = Object.entries(snapshot).filter(([k]) => k !== 'address');
  for (const [, result] of entries) {
    if (!result || typeof result !== 'object' || !('provider' in result)) continue;
    const r = result as { provider: string };
    await pool.query(
      `INSERT INTO property_data (property_id, provider, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (property_id, provider) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
      [propertyId, r.provider, result]
    );
  }
}
