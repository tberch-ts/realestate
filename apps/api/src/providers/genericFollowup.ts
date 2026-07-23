import type { FollowupProperty, FollowupResult, MarketKey, ProviderResult } from '@mfa/shared';
import { fetchHotspots } from './neighborhoods.js';
import { getFollowupSource, type FollowupSource } from './followupSources.js';
import { extractPolygonRings } from './followupCommon.js';
import { scoreFollowup } from './followupScoring.js';

// Generalized follow-up provider — the non-Denver counterpart to
// denverFollowup.ts. Given a market + neighborhood name, it:
//   1. Pulls the neighborhood polygon from the (cached) Hotspots GeoJSON,
//      which every market with a neighborhoodSources.ts entry already has.
//   2. Spatial-intersects that polygon against the market's county assessor
//      parcel layer, filtered to multifamily parcels (per followupSources.ts).
//   3. Maps + scores the rows with the shared follow-up scoring.
//
// This is the same shape as denverFollowup.ts; Denver stays on its own
// provider because it queries a purpose-built Middle-Housing layer with a
// real unit count, whereas these markets reuse their general parcel roll.

// In-memory cache keyed by "market:zone:minUnits:minYear".
const cache = new Map<string, { data: FollowupResult; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchGenericFollowup(
  market: MarketKey,
  opts: { zone: string; minUnits?: number; minYear?: number; limit?: number }
): Promise<ProviderResult<FollowupResult>> {
  const provider = `${market}_followup`;
  const source = getFollowupSource(market);
  if (!source) {
    return { provider, status: 'not_available', message: `No follow-up source configured for '${market}'` };
  }

  const minUnits = opts.minUnits ?? 100;
  const minYear = opts.minYear ?? 1990;
  const limit = Math.min(opts.limit ?? 50, 200);
  const cacheKey = `${market}:${opts.zone.toLowerCase()}:${minUnits}:${minYear}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: slice(hit.data, limit), fetchedAt: new Date(hit.ts).toISOString() };
  }

  // 1. Find the zone polygon from the cached neighborhoods GeoJSON.
  const hs = await fetchHotspots(market);
  if (hs.status !== 'ok' || !hs.data) {
    return { provider, status: 'error', message: `Hotspots cache unavailable for ${market}` };
  }
  const target = opts.zone.toLowerCase();
  const feature = hs.data.features.find(
    (f) => String(f.properties.nbhd_name ?? '').toLowerCase() === target
  );
  if (!feature) {
    return { provider, status: 'not_available', message: `Zone '${opts.zone}' not found in ${market}` };
  }

  // 2. Spatial query against the county parcel layer.
  try {
    const rings = extractPolygonRings(feature.geometry);
    const geometry = JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
    const where = buildWhere(source, minUnits, minYear);

    // ArcGIS polygon geometry JSON is too big for a GET query string; POST it.
    const params = new URLSearchParams({
      where,
      geometry,
      geometryType: 'esriGeometryPolygon',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
      f: 'json',
      resultRecordCount: '200',
    });

    const res = await fetch(source.queryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) return { provider, status: 'error', message: `ArcGIS HTTP ${res.status}` };
    const body = (await res.json()) as {
      features?: Array<{ attributes: Record<string, unknown>; geometry?: unknown }>;
      error?: { message: string };
    };
    if (body.error) return { provider, status: 'error', message: body.error.message };

    const fallbackCenter = feature.properties._centroid as [number, number] | undefined;
    const properties = (body.features ?? [])
      .map((f) => source.toProperty(f.attributes, f.geometry, fallbackCenter ?? [0, 0]))
      .filter((p): p is FollowupProperty => p !== null);

    const scored = properties
      .map((p) => scoreFollowup(p, source.homeState))
      .sort((a, b) => b.score - a.score);

    const full: FollowupResult = { zone: opts.zone, count: scored.length, candidates: scored };
    cache.set(cacheKey, { data: full, ts: Date.now() });

    return { provider, status: 'ok', data: slice(full, limit), fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

// multifamily filter + optional numeric min-units / min-year gates. The
// numeric gates only apply when the layer has the relevant field (see
// followupSources.ts) — markets without a unit count ignore minUnits.
function buildWhere(source: FollowupSource, minUnits: number, minYear: number): string {
  const clauses = [`(${source.multifamilyWhere})`];
  if (source.unitsField && minUnits > 0) clauses.push(`${source.unitsField} >= ${minUnits}`);
  if (source.yearField && minYear > 0) clauses.push(`${source.yearField} >= ${minYear}`);
  return clauses.join(' AND ');
}

function slice(r: FollowupResult, limit: number): FollowupResult {
  return { zone: r.zone, count: r.count, candidates: r.candidates.slice(0, limit) };
}
