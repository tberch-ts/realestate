import { Router } from 'express';
import { searchFormD, getFormDDetail } from '../providers/edgarFormD.js';

export const filingsRouter = Router();

// GET /api/filings/form-d?state=CO&keyword=real+estate&dateFrom=2024-01-01&dateTo=2025-12-31&limit=100
filingsRouter.get('/form-d', async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : '"real estate"';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 100)));

    const data = await searchFormD({ state, keyword, dateFrom, dateTo, limit });
    res.json({
      provider: 'edgar_form_d',
      status: 'ok',
      data,
      count: data.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ provider: 'edgar_form_d', status: 'error', message: (err as Error).message });
  }
});

// GET /api/filings/form-d/:accession?cik=0000945621
filingsRouter.get('/form-d/:accession', async (req, res) => {
  try {
    const { accession } = req.params;
    const cik = typeof req.query.cik === 'string' ? req.query.cik : '';
    if (!cik) {
      res.status(400).json({ status: 'error', message: 'cik query parameter required' });
      return;
    }
    const data = await getFormDDetail(accession, cik);
    if (!data) {
      res.status(404).json({ status: 'not_found', message: 'Form D detail not available' });
      return;
    }
    res.json({ provider: 'edgar_form_d', status: 'ok', data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ provider: 'edgar_form_d', status: 'error', message: (err as Error).message });
  }
});
