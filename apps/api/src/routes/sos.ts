import { Router } from 'express';
import { fetchSosEntity } from '../providers/coloradoSos.js';

export const sosRouter = Router();

sosRouter.get('/entity', async (req, res, next) => {
  try {
    const name = String(req.query.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name query param required' });
    const result = await fetchSosEntity(name);
    if (result.status !== 'ok') return res.status(502).json(result);
    // Cache in the HTTP layer too — entity data is stable.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(result);
  } catch (err) {
    next(err);
  }
});
