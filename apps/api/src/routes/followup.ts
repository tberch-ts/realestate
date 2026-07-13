import { Router } from 'express';
import type { MarketKey } from '@mfa/shared';
import { fetchFollowup } from '../providers/followupDispatcher.js';

export const followupRouter = Router();

// Generalized off markets.ts (was Denver-only `/denver`). `/:market`
// matches `/denver` with market === 'denver', so existing callers keep
// working unchanged — no separate alias route needed.
followupRouter.get('/:market', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const zone = String(req.query.zone ?? '').trim();
    if (!zone) return res.status(400).json({ error: 'zone query param required' });

    const minUnits = req.query.minUnits ? Number(req.query.minUnits) : undefined;
    const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await fetchFollowup(market, { zone, minUnits, minYear, limit });
    if (result.status !== 'ok' || !result.data) {
      return res.status(result.status === 'not_available' ? 200 : 502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
