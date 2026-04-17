import { Router } from 'express';
import {
  fetchDenverOwners,
  fetchDenverPortfolio,
  fetchOwnerPortfolio,
} from '../providers/denverPortfolio.js';

export const portfolioRouter = Router();

// All qualifying properties in Denver (flat list). Used by the raw table view.
portfolioRouter.get('/denver', async (req, res, next) => {
  try {
    const minUnits = req.query.minUnits ? Number(req.query.minUnits) : undefined;
    const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
    const result = await fetchDenverPortfolio({ minUnits, minYear });
    if (result.status !== 'ok' || !result.data) return res.status(502).json(result);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Grouped by owner. Supports outOfStateOnly + search + limit.
portfolioRouter.get('/denver/owners', async (req, res, next) => {
  try {
    const minUnits = req.query.minUnits ? Number(req.query.minUnits) : undefined;
    const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
    const outOfStateOnly = req.query.outOfState === '1' || req.query.outOfState === 'true';
    const search = req.query.search ? String(req.query.search) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await fetchDenverOwners({
      minUnits,
      minYear,
      outOfStateOnly,
      search,
      limit,
    });
    if (result.status !== 'ok' || !result.data) return res.status(502).json(result);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Single owner's full portfolio (all properties + aggregate stats).
portfolioRouter.get('/denver/owner', async (req, res, next) => {
  try {
    const name = String(req.query.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name query param required' });
    const result = await fetchOwnerPortfolio(name);
    if (result.status !== 'ok') return res.status(502).json(result);
    if (!result.data) return res.status(404).json({ error: 'owner not found' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
