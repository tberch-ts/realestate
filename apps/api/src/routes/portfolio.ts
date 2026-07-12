import { Router } from 'express';
import type { MarketKey } from '@mfa/shared';
import { fetchOwner, fetchOwners, fetchPortfolio } from '../providers/portfolioDispatcher.js';

export const portfolioRouter = Router();

// Generalized off markets.ts (was Denver-only `/denver`). `/:market`
// matches `/denver` with market === 'denver', so existing callers keep
// working unchanged — no separate alias route needed.

// All qualifying properties in a market (flat list). Used by the raw table view.
portfolioRouter.get('/:market', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const minUnits = req.query.minUnits ? Number(req.query.minUnits) : undefined;
    const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
    const result = await fetchPortfolio(market, { minUnits, minYear });
    if (result.status !== 'ok' || !result.data) {
      return res.status(result.status === 'not_available' ? 200 : 502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Grouped by owner. Supports outOfStateOnly + search + limit.
portfolioRouter.get('/:market/owners', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const minUnits = req.query.minUnits ? Number(req.query.minUnits) : undefined;
    const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
    const outOfStateOnly = req.query.outOfState === '1' || req.query.outOfState === 'true';
    const search = req.query.search ? String(req.query.search) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await fetchOwners(market, {
      minUnits,
      minYear,
      outOfStateOnly,
      search,
      limit,
    });
    if (result.status !== 'ok' || !result.data) {
      return res.status(result.status === 'not_available' ? 200 : 502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Single owner's full portfolio (all properties + aggregate stats).
portfolioRouter.get('/:market/owner', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const name = String(req.query.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name query param required' });
    const result = await fetchOwner(market, name);
    if (result.status === 'not_available') return res.status(200).json(result);
    if (result.status !== 'ok') return res.status(502).json(result);
    if (!result.data) return res.status(404).json({ error: 'owner not found' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
