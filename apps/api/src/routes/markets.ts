import { Router } from 'express';
import { compareMarkets } from '../providers/marketCompare.js';
import { MARKETS } from '../config/markets.js';

export const marketsRouter = Router();

// List every configured MSA with its per-capability support flags.
// Frontend uses this to render the market picker and gray-out gated
// tabs (neighborhoods/followup/portfolio are Denver-only as of today).
marketsRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    provider: 'markets_registry',
    status: 'ok',
    data: { count: MARKETS.length, markets: MARKETS },
    fetchedAt: new Date().toISOString(),
  });
});

// Score ~20 candidate metros against Denver on size/income/rent (similarity)
// and landlord-friendliness/crime/affordability (investability).
marketsRouter.get('/compare', async (req, res) => {
  try {
    const force = req.query.force === '1';
    const rows = await compareMarkets({ force });
    res.json({
      provider: 'market_compare',
      status: 'ok',
      data: { count: rows.length, markets: rows },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      provider: 'market_compare',
      status: 'error',
      message: (err as Error).message,
    });
  }
});
