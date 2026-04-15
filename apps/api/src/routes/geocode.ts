import { Router } from 'express';
import { geocodeAddress } from '../providers/index.js';

export const geocodeRouter = Router();

geocodeRouter.get('/', async (req, res, next) => {
  try {
    const address = String(req.query.address ?? '').trim();
    if (!address) return res.status(400).json({ error: 'address query param required' });
    const result = await geocodeAddress(address);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
