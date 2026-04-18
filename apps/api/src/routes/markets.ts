import { Router } from 'express';
import { compareMarkets } from '../providers/marketCompare.js';

export const marketsRouter = Router();

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
