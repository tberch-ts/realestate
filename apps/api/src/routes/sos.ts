import { Router } from 'express';
import { fetchSosByState } from '../providers/sosDispatcher.js';

export const sosRouter = Router();

// ?name=<entity>&state=<CO|FL|...>  — state defaults to CO for
// backward compat with the pre-multi-market frontend.
sosRouter.get('/entity', async (req, res, next) => {
  try {
    const name = String(req.query.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name query param required' });
    const state = String(req.query.state ?? 'CO').trim().toUpperCase();

    const result = await fetchSosByState(name, state);
    if (result.status !== 'ok') {
      // not_available and needs_credentials are both non-error returns.
      if (result.status === 'error') return res.status(502).json(result);
      return res.status(200).json(result);
    }
    // Cache in the HTTP layer too — entity data is stable.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
