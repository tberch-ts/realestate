import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LandSaturationZoneProps, MarketKey, ProviderResult } from '@mfa/shared';
import { num, str } from './landCommon.js';

// Builder-activity ("saturation") map for the land strategy: which ZIP
// codes have lots of recently-SOLD vacant lots and fresh construction —
// i.e. where builders are actively buying. Aggregated BY ZIP because
// vacant land and new construction are overwhelmingly suburban/exurban
// (county-wide), not inside city-neighborhood boundaries — and because
// builder buy boxes are defined by zip, so this is the unit wholesalers
// actually think in.
//
// Returns a GeoJSON FeatureCollection of POINTS (one per zip, positioned
// at the average of that zip's sold-lot parcels), same envelope shape the
// client map consumes. No Census / hotspots dependency — every parcel
// carries its own zip, so a single parcel fetch + one stats query per
// signal is all it takes.

interface GeoPointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: LandSaturationZoneProps & Record<string, unknown>;
}
interface GeoFC {
  type: 'FeatureCollection';
  features: GeoPointFeature[];
}

interface LandSatSource {
  url: string;
  zipField: string;
  priceField: string;
  soldWhere: (cutoffIso: string) => string;   // vacant lots sold in last 12mo
  newConWhere: (minYear: number) => string;    // structures built in last ~2y
}

const SOURCES: Partial<Record<MarketKey, LandSatSource>> = {
  raleigh: {
    url: 'https://maps.wake.gov/arcgis/rest/services/Property/Parcels/FeatureServer/0/query',
    zipField: 'ZIPNUM',
    priceField: 'TOTSALPRICE',
    soldWhere: (cutoff) => `LAND_CLASS = 'VAC' AND SALE_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `YEAR_BUILT >= ${minYear}`,
  },
  tampa: {
    url: 'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query',
    zipField: 'SITE_ZIP',
    priceField: 'AMT',
    soldWhere: (cutoff) => `DOR_C IN ('0000','1000','4000') AND S_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `ACT >= ${minYear}`,
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

  try {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const minYear = now.getFullYear() - 2;

    const [soldParcels, newByZip] = await Promise.all([
      fetchSoldParcels(source, source.soldWhere(cutoffIso)),
      fetchCountByZip(source, source.newConWhere(minYear)),
    ]);

    // Aggregate sold lots by zip: count, centroid (avg of parcel centroids),
    // and true median sale price.
    interface Agg { count: number; sx: number; sy: number; prices: number[] }
    const byZip = new Map<string, Agg>();
    for (const p of soldParcels) {
      const z = p.zip;
      if (!z) continue;
      const a = byZip.get(z) ?? { count: 0, sx: 0, sy: 0, prices: [] };
      a.count++;
      a.sx += p.lng;
      a.sy += p.lat;
      if (p.price != null && p.price > 0) a.prices.push(p.price);
      byZip.set(z, a);
    }

    // Build one feature per zip that has sold-lot activity (the actionable
    // set — a zip with construction but zero recent lot sales has no
    // inventory to farm).
    const soldCounts = [...byZip.values()].map((a) => a.count);
    const newCounts = [...byZip.keys()].map((z) => newByZip.get(z) ?? 0);

    const features: GeoPointFeature[] = [];
    for (const [zip, a] of byZip) {
      const sold = a.count;
      const newCon = newByZip.get(zip) ?? 0;
      const s = scale(sold, soldCounts);
      const n = scale(newCon, newCounts);
      const prices = a.prices.sort((x, y) => x - y);
      const props: LandSaturationZoneProps & Record<string, unknown> = {
        name: zip,
        score: Math.round(s * 0.6 + n * 0.4),
        soldLots12mo: sold,
        newConstruction24mo: newCon,
        medianLotSalePrice: prices.length ? prices[Math.floor(prices.length / 2)] : undefined,
      };
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.sx / sold, a.sy / sold] },
        properties: props,
      });
    }

    features.sort((x, y) => y.properties.score - x.properties.score);

    const data: GeoFC = { type: 'FeatureCollection', features };
    memCache.set(market, { data, ts: Date.now() });
    await saveDiskCache(market);
    return { provider, status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

// ---------- upstream fetches ----------

// Sold vacant lots (bounded — hundreds to low thousands) with zip +
// centroid + price. Paged to be safe.
async function fetchSoldParcels(
  source: LandSatSource,
  where: string
): Promise<Array<{ zip?: string; lng: number; lat: number; price?: number }>> {
  const out: Array<{ zip?: string; lng: number; lat: number; price?: number }> = [];
  const PAGE = 2000;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where,
      outFields: `${source.zipField},${source.priceField}`,
      returnGeometry: 'true',
      returnCentroid: 'true',
      outSR: '4326',
      geometryPrecision: '5',
      resultOffset: String(page * PAGE),
      resultRecordCount: String(PAGE),
      f: 'json',
    });
    const res = await fetch(source.url, {
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
      out.push({
        zip: zip5(str(f.attributes[source.zipField])),
        lng: c.x,
        lat: c.y,
        price: num(f.attributes[source.priceField]),
      });
    }
    if (!body.exceededTransferLimit || feats.length < PAGE) break;
  }
  return out;
}

// Count per zip via a single groupBy-stats request (no geometry, no
// paging — exact county-wide counts even for tens of thousands of rows).
async function fetchCountByZip(source: LandSatSource, where: string): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
    ]),
    groupByFieldsForStatistics: source.zipField,
    f: 'json',
  });
  const res = await fetch(source.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const body = (await res.json()) as {
    features?: Array<{ attributes: Record<string, unknown> }>;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);

  // Fold to 5-digit zip keys (some sources return ZIP+4) so counts line up
  // with the sold-lot aggregation.
  const map = new Map<string, number>();
  for (const f of body.features ?? []) {
    const z = zip5(str(f.attributes[source.zipField]));
    if (!z) continue;
    const n = num(f.attributes.n) ?? num(f.attributes.N) ?? 0;
    map.set(z, (map.get(z) ?? 0) + n);
  }
  return map;
}

function zip5(z: string | undefined): string | undefined {
  if (!z) return undefined;
  const m = /\d{5}/.exec(z);
  return m ? m[0] : undefined;
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
