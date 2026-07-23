import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LandSaturationZoneProps, MarketKey, ProviderResult } from '@mfa/shared';
import { num, str } from './landCommon.js';
import {
  arcgisQuery,
  LAND_PARCEL_SOURCES,
  ringsCentroid,
  scale,
  zip5,
  type LandParcelSource,
} from './landArcgis.js';

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

// Endpoints + field names live in landArcgis.ts (shared with builderSearch).
const SOURCES = LAND_PARCEL_SOURCES;

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
  source: LandParcelSource,
  where: string
): Promise<Array<{ zip?: string; lng: number; lat: number; price?: number }>> {
  const out: Array<{ zip?: string; lng: number; lat: number; price?: number }> = [];
  const PAGE = 2000;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    const feats = await arcgisQuery(source.url, {
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
    if (feats.length < PAGE) break;
  }
  return out;
}

// Count per zip via a single groupBy-stats request (no geometry, no
// paging — exact county-wide counts even for tens of thousands of rows).
async function fetchCountByZip(source: LandParcelSource, where: string): Promise<Map<string, number>> {
  const feats = await arcgisQuery(source.url, {
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
    ]),
    groupByFieldsForStatistics: source.zipField,
    f: 'json',
  });

  // Fold to 5-digit zip keys (some sources return ZIP+4) so counts line up
  // with the sold-lot aggregation.
  const map = new Map<string, number>();
  for (const f of feats) {
    const z = zip5(str(f.attributes[source.zipField]));
    if (!z) continue;
    const n = num(f.attributes.n) ?? num(f.attributes.N) ?? 0;
    map.set(z, (map.get(z) ?? 0) + n);
  }
  return map;
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
