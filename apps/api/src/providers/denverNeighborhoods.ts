import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderResult } from '@mfa/shared';

const CACHE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.cache/denver_hotspots.json'
);

// Denver neighborhood boundaries via ArcGIS Open Data (free, no key).
// Returns GeoJSON FeatureCollection with ~78 statistical neighborhoods.
// Each feature gets scored by Census ACS data fetched for the centroid.

const NEIGHBORHOODS_URL =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/Neighborhoods/FeatureServer/0/query';

const CENSUS_URL = (year: number) => `https://api.census.gov/data/${year}/acs/acs5`;
const CENSUS_GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

const VARS = ['B19013_001E', 'B01003_001E', 'B25064_001E', 'B25070_010E'];
// B19013_001E = median HH income, B01003_001E = population,
// B25064_001E = median gross rent, B25070_010E = rent burdened 50%+

export interface NeighborhoodScore {
  name: string;
  score: number;
  medianIncome?: number;
  medianRent?: number;
  population?: number;
  rentBurdenedPct?: number;
  centroid: [number, number]; // [lng, lat]
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: Record<string, unknown>;
}

// In-memory cache
let cache: { data: GeoJsonFeatureCollection; ts: number } | null = null;
let inflight: Promise<ProviderResult<GeoJsonFeatureCollection>> | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function fetchDenverHotspots(): Promise<ProviderResult<GeoJsonFeatureCollection>> {
  const provider = 'denver_hotspots';

  // Lazy-load disk cache on first call
  if (!cache) await loadDiskCache();

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: cache.data, fetchedAt: new Date(cache.ts).toISOString() };
  }
  if (inflight) return inflight; // coalesce concurrent callers

  inflight = doFetch();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// Kick off a background warm-up — resolves immediately, scoring happens async.
// Safe to call many times; coalesced internally.
export function warmDenverHotspots(): void {
  fetchDenverHotspots().catch((e) => console.error('[hotspots] warm failed:', e));
}

async function loadDiskCache(): Promise<void> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { data: GeoJsonFeatureCollection; ts: number };
    if (parsed?.data?.features) {
      cache = parsed;
      console.log(`[hotspots] loaded disk cache (${parsed.data.features.length} features, age ${Math.round((Date.now() - parsed.ts) / 60000)}m)`);
    }
  } catch {
    // No cache file yet — that's fine.
  }
}

async function saveDiskCache(): Promise<void> {
  if (!cache) return;
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache));
  } catch (e) {
    console.warn('[hotspots] could not persist cache:', (e as Error).message);
  }
}

async function doFetch(): Promise<ProviderResult<GeoJsonFeatureCollection>> {
  const provider = 'denver_hotspots';
  try {
    // 1. Fetch neighborhood boundaries as GeoJSON
    const url = new URL(NEIGHBORHOODS_URL);
    url.searchParams.set('where', '1=1');
    url.searchParams.set('outFields', '*');
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('f', 'geojson');
    url.searchParams.set('resultRecordCount', '200');

    const res = await fetch(url);
    if (!res.ok) return { provider, status: 'error', message: `Neighborhoods HTTP ${res.status}` };
    const geojson = (await res.json()) as GeoJsonFeatureCollection;

    if (!geojson.features || geojson.features.length === 0) {
      return { provider, status: 'error', message: 'No neighborhood features returned' };
    }

    // 2. Compute centroid for each neighborhood & score via Census
    const { geojson: scored, withData } = await scoreNeighborhoods(geojson);

    // If not a single neighborhood got real Census data (e.g. CENSUS_API_KEY
    // missing/invalid — Census now hard-requires a key, redirecting keyless
    // requests to an HTML "missing key" page instead of erroring), every
    // composite ties and the rank-normalization below maps "tied for last"
    // to "ranked 1st" for all of them — i.e. every neighborhood scores 95.
    // Fail loudly instead of serving that, and don't clobber a previously
    // good cache with it.
    if (withData === 0) {
      const message = 'No neighborhoods returned usable Census data — check CENSUS_API_KEY is set and valid.';
      if (cache) {
        console.warn(`[hotspots] ${message} Serving previous cache instead.`);
        return { provider, status: 'ok', data: cache.data, fetchedAt: new Date(cache.ts).toISOString() };
      }
      return { provider, status: 'error', message };
    }

    cache = { data: scored, ts: Date.now() };
    void saveDiskCache();
    return { provider, status: 'ok', data: scored, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

async function scoreNeighborhoods(
  geojson: GeoJsonFeatureCollection
): Promise<{ geojson: GeoJsonFeatureCollection; withData: number }> {
  const raw: Array<{ idx: number; income?: number; pop?: number; rent?: number; burdened?: number }> = [];
  const total = geojson.features.length;
  const t0 = Date.now();
  console.log(`[hotspots] scoring ${total} Denver neighborhoods…`);

  // Compute all centroids up front (cheap, pure math).
  const tasks: Array<{ idx: number; lng: number; lat: number }> = [];
  for (let i = 0; i < total; i++) {
    const f = geojson.features[i];
    const [lng, lat] = computeCentroid(f.geometry);
    f.properties._centroid = [lng, lat];
    tasks.push({ idx: i, lng, lat });
  }

  // api.census.gov 503s on concurrent hits. Run one-at-a-time sequentially.
  // ~40-60s first time; cached 24h after that. Server warms cache on boot
  // so this almost never blocks a user request.
  for (const t of tasks) {
    try {
      const tract = await resolveToTract(t.lng, t.lat);
      if (!tract) {
        raw.push({ idx: t.idx });
        continue;
      }
      const vals = await fetchAcsVars(tract);
      raw.push({ idx: t.idx, income: vals[0], pop: vals[1], rent: vals[2], burdened: vals[3] });
    } catch {
      raw.push({ idx: t.idx });
    }
  }
  const withData = raw.filter((r) => r.income != null || r.pop != null || r.rent != null).length;
  console.log(`[hotspots] scored ${total} in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${withData} with Census data`);
  fetchErrCount = 0;

  // Compute percentiles for relative scoring
  const incomes = raw.map((r) => r.income).filter(Boolean) as number[];
  const rents = raw.map((r) => r.rent).filter(Boolean) as number[];
  const pops = raw.map((r) => r.pop).filter(Boolean) as number[];
  const burdens = raw.map((r) => r.burdened).filter(Boolean) as number[];

  // First pass: compute raw composite (0-100) for every neighborhood.
  const rawScores: number[] = [];
  for (const r of raw) {
    const incPct = percentile(r.income, incomes);
    const rentPct = percentile(r.rent, rents);
    const popPct = percentile(r.pop, pops);
    const burdPct = percentile(r.burdened, burdens);
    const rentGapScore = 100 - (rentPct ?? 50);
    const composite =
      (incPct ?? 50) * 0.25 +
      rentGapScore * 0.30 +
      (popPct ?? 50) * 0.15 +
      (burdPct ?? 50) * 0.15 +
      50 * 0.15;
    rawScores.push(composite);
  }

  // Second pass: rank-normalize so the top neighborhood ≈ 95 and the bottom ≈ 20.
  // This spreads scores across the full range so the "90+ hot" tier is always populated
  // by Denver's actually best neighborhoods, even if the underlying composites are tight.
  const sorted = [...rawScores].sort((a, b) => a - b);
  const n = sorted.length;

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const f = geojson.features[r.idx];
    const composite = rawScores[i];
    // Rank position: 0 = worst, 1 = best (using dense rank-ish).
    const rank = sorted.filter((s) => s <= composite).length / n;
    // Scale: rank 0 → 20, rank 1 → 95.
    const score = Math.round(20 + rank * 75);

    f.properties.score = score;
    f.properties.medianIncome = r.income;
    f.properties.medianRent = r.rent;
    f.properties.population = r.pop;
    f.properties.rentBurdenedPct = r.burdened;
    f.properties.nbhd_name = f.properties.NBHD_NAME ?? f.properties.nbhd_name ?? f.properties.NAME ?? 'Unknown';
  }

  return { geojson, withData };
}

function computeCentroid(geometry: GeoJsonFeature['geometry']): [number, number] {
  // Flatten all coordinate rings to find average
  const coords: number[][] = [];
  function collect(arr: unknown[]): void {
    if (typeof arr[0] === 'number') {
      coords.push(arr as number[]);
    } else {
      for (const sub of arr) collect(sub as unknown[]);
    }
  }
  collect(geometry.coordinates as unknown[]);

  if (coords.length === 0) return [-104.99, 39.74]; // Denver fallback
  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  return [sumLng / coords.length, sumLat / coords.length];
}

let fetchErrCount = 0;
async function fetchJson(url: URL, timeoutMs: number, retries = 2): Promise<unknown | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.ok) return await res.json();
      // 503 / 429 = transient — back off and retry
      if ((res.status === 503 || res.status === 429) && attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (fetchErrCount++ < 3) console.log('[hotspots] HTTP', res.status, url.hostname);
      return null;
    } catch (e) {
      if (attempt < retries) {
        await sleep(300);
        continue;
      }
      if (fetchErrCount++ < 3) console.log('[hotspots] fetch err', (e as Error).message, url.hostname);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function resolveToTract(lng: number, lat: number): Promise<{ state: string; county: string; tract: string } | null> {
  const url = new URL(CENSUS_GEOCODER);
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');

  const body = (await fetchJson(url, 6000)) as
    | { result?: { geographies?: { 'Census Tracts'?: Array<{ STATE: string; COUNTY: string; TRACT: string }> } } }
    | null;
  const t = body?.result?.geographies?.['Census Tracts']?.[0];
  return t ? { state: t.STATE, county: t.COUNTY, tract: t.TRACT } : null;
}

async function fetchAcsVars(tract: { state: string; county: string; tract: string }): Promise<(number | undefined)[]> {
  // Hand-build the query string: Census rejects `+`-encoded spaces in the `in`
  // parameter and takes ~15s to time out on them. Use %20 explicitly.
  const qs =
    `get=${encodeURIComponent(VARS.join(','))}` +
    `&for=${encodeURIComponent(`tract:${tract.tract}`)}` +
    `&in=state:${tract.state}%20county:${tract.county}` +
    (process.env.CENSUS_API_KEY ? `&key=${encodeURIComponent(process.env.CENSUS_API_KEY)}` : '');
  const url = new URL(`${CENSUS_URL(2022)}?${qs}`);

  const body = (await fetchJson(url, 6000)) as string[][] | null;
  if (!body || body.length < 2) return [undefined, undefined, undefined, undefined];
  return body[1].slice(0, VARS.length).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  });
}

function percentile(value: number | undefined, sorted: number[]): number | undefined {
  if (value === undefined || sorted.length === 0) return undefined;
  const s = [...sorted].sort((a, b) => a - b);
  let idx = s.findIndex((v) => v >= value);
  if (idx === -1) idx = s.length;
  return Math.round((idx / s.length) * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
