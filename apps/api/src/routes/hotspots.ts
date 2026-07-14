import { Router } from 'express';
import type { MarketKey } from '@mfa/shared';
import { fetchHotspots } from '../providers/neighborhoods.js';
import { getMarket, supportedNeighborhoodMarkets } from '../config/markets.js';

export const hotspotsRouter = Router();

// A single neighborhood's row in a ranked list, including the score
// breakdown so callers can show *why* it ranks where it does rather than
// just the final composite. See neighborhoods.ts's scoreNeighborhoods()
// for how these are computed.
interface RankedEntry {
  market: MarketKey;
  marketLabel: string;
  name: string;
  score: number;
  rankInMarket?: number;
  totalInMarket?: number;
  centroid?: [number, number];
  medianIncome?: number;
  medianRent?: number;
  population?: number;
  rentBurdenedPct?: number;
  breakdown: {
    incomePercentile?: number;
    rentPercentile?: number;
    populationPercentile?: number;
    rentBurdenPercentile?: number;
  };
}

interface GeoJsonFeatureLike {
  properties: Record<string, unknown>;
}

function toRankedEntries(market: MarketKey, marketLabel: string, features: GeoJsonFeatureLike[]): RankedEntry[] {
  return features.map((f) => ({
    market,
    marketLabel,
    name: String(f.properties.nbhd_name ?? 'Unknown'),
    score: Number(f.properties.score ?? 0),
    rankInMarket: f.properties.rankInMarket as number | undefined,
    totalInMarket: f.properties.totalInMarket as number | undefined,
    centroid: f.properties._centroid as [number, number] | undefined,
    medianIncome: f.properties.medianIncome as number | undefined,
    medianRent: f.properties.medianRent as number | undefined,
    population: f.properties.population as number | undefined,
    rentBurdenedPct: f.properties.rentBurdenedPct as number | undefined,
    breakdown: {
      incomePercentile: f.properties.incomePercentile as number | undefined,
      rentPercentile: f.properties.rentPercentile as number | undefined,
      populationPercentile: f.properties.populationPercentile as number | undefined,
      rentBurdenPercentile: f.properties.rentBurdenPercentile as number | undefined,
    },
  }));
}

// Cross-market summary — every neighborhood across every market with a
// live Hotspots source, filtered by score and sorted desc. Powers the
// "Hot Zones" summary/list view (as opposed to the single-market map).
// Registered before `/:market/ranked` so `/all/ranked` doesn't get
// swallowed by that param route (both are two path segments).
hotspotsRouter.get('/all/ranked', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 200), 500);
    const minScore = Number(req.query.minScore ?? 75);
    const markets = supportedNeighborhoodMarkets();

    const perMarket = await Promise.all(
      markets.map(async (cfg) => {
        const result = await fetchHotspots(cfg.key);
        if (result.status !== 'ok' || !result.data) return [];
        return toRankedEntries(cfg.key, cfg.label, result.data.features);
      })
    );

    const ranked = perMarket
      .flat()
      .filter((n) => n.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ provider: 'all_hotspots', status: 'ok', data: ranked });
  } catch (err) {
    next(err);
  }
});

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
// Returns just { name, score, centroid, metrics, breakdown } per
// neighborhood, sorted by score desc. No polygons, small payload.
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
    const ranked = toRankedEntries(market, cfg.label, result.data.features)
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
