import { Router } from 'express';
import type { MarketKey } from '@mfa/shared';
import { fetchHotspots } from '../providers/neighborhoods.js';
import { getMarket } from '../config/markets.js';

export const hotspotsRouter = Router();

// Full GeoJSON FeatureCollection for the heat-map page, generalized off
// markets.ts (was Denver-only `/denver`). `/denver` and `/denver/ranked`
// stay as aliases below so nothing already deployed breaks.
hotspotsRouter.get('/:market', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const cfg = getMarket(market);
    if (!cfg) {
      return res.status(404).json({ provider: 'hotspots', status: 'not_available', message: `Unknown market '${market}'` });
    }
    if (!cfg.neighborhoodsSupported) {
      return res.status(200).json({
        provider: 'hotspots',
        status: 'not_available',
        message: cfg.notes
          ? `Hotspots aren't available for ${cfg.label} yet — ${cfg.notes}`
          : `Hotspots aren't available for ${cfg.label} yet.`,
      });
    }
    const result = await fetchHotspots(market);
    if (result.status !== 'ok' || !result.data) {
      return res.status(502).json(result);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Lightweight ranked list — used by the homepage "Hot Zones" strip.
// Returns just { name, score, centroid, metrics } per neighborhood,
// sorted by score desc. No polygons, small payload.
hotspotsRouter.get('/:market/ranked', async (req, res, next) => {
  try {
    const market = req.params.market as MarketKey;
    const cfg = getMarket(market);
    if (!cfg) {
      return res.status(404).json({ provider: 'hotspots', status: 'not_available', message: `Unknown market '${market}'` });
    }
    if (!cfg.neighborhoodsSupported) {
      return res.status(200).json({
        provider: 'hotspots',
        status: 'not_available',
        message: cfg.notes
          ? `Hotspots aren't available for ${cfg.label} yet — ${cfg.notes}`
          : `Hotspots aren't available for ${cfg.label} yet.`,
        data: [],
      });
    }
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const minScore = Number(req.query.minScore ?? 0);
    const result = await fetchHotspots(market);
    if (result.status !== 'ok' || !result.data) {
      return res.status(502).json(result);
    }
    const ranked = result.data.features
      .map((f) => ({
        name: String(f.properties.nbhd_name ?? 'Unknown'),
        score: Number(f.properties.score ?? 0),
        centroid: f.properties._centroid as [number, number] | undefined,
        medianIncome: f.properties.medianIncome as number | undefined,
        medianRent: f.properties.medianRent as number | undefined,
        population: f.properties.population as number | undefined,
        rentBurdenedPct: f.properties.rentBurdenedPct as number | undefined,
      }))
      .filter((n) => n.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ provider: `${market}_hotspots`, status: 'ok', data: ranked });
  } catch (err) {
    next(err);
  }
});

// Note: no separate `/denver` alias needed — `/:market` and
// `/:market/ranked` above already match `/denver` and `/denver/ranked`
// with `market === 'denver'`, so every pre-multi-market caller keeps
// working unchanged.
