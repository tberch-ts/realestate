import { Router } from 'express';
import { fetchDenverHotspots } from '../providers/denverNeighborhoods.js';

export const hotspotsRouter = Router();

// Full GeoJSON FeatureCollection for the heat-map page.
hotspotsRouter.get('/denver', async (_req, res, next) => {
  try {
    const result = await fetchDenverHotspots();
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
hotspotsRouter.get('/denver/ranked', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const minScore = Number(req.query.minScore ?? 0);
    const result = await fetchDenverHotspots();
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
    res.json({ provider: 'denver_hotspots', status: 'ok', data: ranked });
  } catch (err) {
    next(err);
  }
});
