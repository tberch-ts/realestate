import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LandSaturationZoneProps, MarketKey, ProviderResult } from '@mfa/shared';
import { fetchHotspots } from './neighborhoods.js';
import { num } from './landCommon.js';

// Builder-activity ("saturation") choropleth for the land strategy: which
// zones have lots of recently-SOLD lots and fresh construction — i.e.
// where builders are actively buying. Returns a GeoJSON FeatureCollection
// with LandSaturationZoneProps per zone — same envelope as
// /api/hotspots/:market so the client map code is shared.
//
// Data flow: zone polygons come from the hotspots cache (exactly how
// denverFollowup.ts gets polygons); parcel activity comes from ONE
// county-wide query per signal (sold vacant lots 12mo; structures built in
// the last 2y), binned into zones with a point-in-polygon test on parcel
// centroids. That keeps us at ~2 upstream queries per market per day
// instead of 2-per-zone.

interface GeoFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}
interface GeoFC {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

interface LandSatSource {
  url: string;
  // where clause for vacant lots sold in the last 12 months
  soldWhere: (cutoffIso: string) => string;
  // where clause for parcels with a structure completed in the last ~2y
  newConWhere: (minYear: number) => string;
  priceField: string;
}

const SOURCES: Partial<Record<MarketKey, LandSatSource>> = {
  raleigh: {
    url: 'https://maps.wake.gov/arcgis/rest/services/Property/Parcels/FeatureServer/0/query',
    soldWhere: (cutoff) => `LAND_CLASS = 'VAC' AND SALE_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `YEAR_BUILT >= ${minYear}`,
    priceField: 'TOTSALPRICE',
  },
  tampa: {
    url: 'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query',
    soldWhere: (cutoff) => `DOR_C IN ('0000','1000','4000') AND S_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `ACT >= ${minYear}`,
    priceField: 'AMT',
  },
};

const memCache = new Map<MarketKey, { data: GeoFC; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const cacheFile = (m: MarketKey) => path.join(CACHE_DIR, `land_saturation_${m}.json`);

export async function fetchLandSaturation(market: MarketKey): Promise<ProviderResult<GeoFC>> {
  const provider = `${market}_land_saturation`;
  const source = SOURCES[market];
  if (!source) {
    return {
      provider,
      status: 'not_available',
      message: `Land saturation isn't available for '${market}' yet — needs a verified parcel source (see landDispatcher.ts).`,
    };
  }

  if (!memCache.has(market)) await loadDiskCache(market);
  const hit = memCache.get(market);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: hit.data, fetchedAt: new Date(hit.ts).toISOString() };
  }

  const zones = await fetchHotspots(market);
  if (zones.status !== 'ok' || !zones.data) {
    return {
      provider,
      status: 'error',
      message: `Zone polygons unavailable (hotspots: ${zones.message ?? zones.status}) — land saturation reuses the hotspots boundary cache.`,
    };
  }

  try {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const minYear = now.getFullYear() - 2;

    const [sold, newCon] = await Promise.all([
      fetchCentroids(source.url, source.soldWhere(cutoffIso), source.priceField),
      fetchCentroids(source.url, source.newConWhere(minYear), source.priceField),
    ]);

    const features = (zones.data as GeoFC).features.map((zf) => {
      const soldIn = sold.filter((p) => pointInFeature(p.lnglat, zf));
      const newIn = newCon.filter((p) => pointInFeature(p.lnglat, zf));
      const prices = soldIn.map((p) => p.price).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
      const props: LandSaturationZoneProps & Record<string, unknown> = {
        name: String(zf.properties.nbhd_name ?? 'Unknown'),
        score: 0, // filled after min-max scaling below
        soldLots12mo: soldIn.length,
        newConstruction24mo: newIn.length,
        medianLotSalePrice: prices.length ? prices[Math.floor(prices.length / 2)] : undefined,
      };
      return {
        type: 'Feature' as const,
        geometry: zf.geometry,
        properties: { ...props, _centroid: zf.properties._centroid },
      };
    });

    // Min-max scale each signal across the market, then blend:
    // 60% sold-lot velocity + 40% new construction.
    const soldCounts = features.map((f) => f.properties.soldLots12mo as number);
    const newCounts = features.map((f) => f.properties.newConstruction24mo as number);
    for (const f of features) {
      const s = scale(f.properties.soldLots12mo as number, soldCounts);
      const n = scale(f.properties.newConstruction24mo as number, newCounts);
      f.properties.score = Math.round(s * 0.6 + n * 0.4);
    }

    const data: GeoFC = { type: 'FeatureCollection', features };
    memCache.set(market, { data, ts: Date.now() });
    await saveDiskCache(market);
    return { provider, status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

// ---------- upstream fetch (paged; centroid-only payloads) ----------

async function fetchCentroids(
  url: string,
  where: string,
  priceField: string
): Promise<Array<{ lnglat: [number, number]; price?: number }>> {
  const out: Array<{ lnglat: [number, number]; price?: number }> = [];
  const PAGE = 2000;
  // Real volumes (verified 2026-07-22): Wake ~19k new-construction rows,
  // Hillsborough ~12k — 10 pages covers both. Runs at most 2x/market/day.
  const MAX_PAGES = 10;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where,
      outFields: priceField,
      returnGeometry: 'true',
      returnCentroid: 'true',
      outSR: '4326',
      geometryPrecision: '4',
      resultOffset: String(page * PAGE),
      resultRecordCount: String(PAGE),
      f: 'json',
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const body = (await res.json()) as {
      features?: Array<{ attributes: Record<string, unknown>; geometry?: unknown; centroid?: { x: number; y: number } }>;
      exceededTransferLimit?: boolean;
      error?: { message: string };
    };
    if (body.error) throw new Error(body.error.message);
    const feats = body.features ?? [];
    for (const f of feats) {
      const c = f.centroid ?? ringsCentroid(f.geometry);
      if (!c) continue;
      out.push({ lnglat: [c.x, c.y], price: num(f.attributes[priceField]) });
    }
    if (!body.exceededTransferLimit || feats.length < PAGE) break;
  }
  return out;
}

function ringsCentroid(geometry: unknown): { x: number; y: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rings = (geometry as any)?.rings as number[][][] | undefined;
  if (!rings?.length) return null;
  const pts = rings.flat();
  if (!pts.length) return null;
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return { x: sx / pts.length, y: sy / pts.length };
}

// ---------- geometry: point in GeoJSON Polygon/MultiPolygon ----------

function pointInFeature(pt: [number, number], f: GeoFeature): boolean {
  const g = f.geometry;
  if (g.type === 'Polygon') return pointInPolygon(pt, g.coordinates as number[][][]);
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).some((poly) => pointInPolygon(pt, poly));
  }
  return false;
}

// Ray casting; ring[0] is the outer ring, others are holes.
function pointInPolygon(pt: [number, number], rings: number[][][]): boolean {
  if (!rings.length) return false;
  if (!pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(pt, rings[i])) return false; // inside a hole
  }
  return true;
}

function pointInRing([x, y]: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function scale(v: number, all: number[]): number {
  const max = Math.max(...all);
  const min = Math.min(...all);
  if (max === min) return max > 0 ? 100 : 0;
  return ((v - min) / (max - min)) * 100;
}

// ---------- disk cache (same shape as neighborhoods.ts) ----------

async function loadDiskCache(market: MarketKey): Promise<void> {
  try {
    const raw = await readFile(cacheFile(market), 'utf8');
    const parsed = JSON.parse(raw) as { data: GeoFC; ts: number };
    if (parsed?.data?.features) memCache.set(market, parsed);
  } catch {
    // No cache file yet — fine.
  }
}

async function saveDiskCache(market: MarketKey): Promise<void> {
  const entry = memCache.get(market);
  if (!entry) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(market), JSON.stringify(entry));
  } catch (e) {
    console.warn(`[land_saturation:${market}] could not persist cache:`, (e as Error).message);
  }
}
