import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketKey, ProviderResult } from '@mfa/shared';
import { getNeighborhoodSource, type NeighborhoodSource } from './neighborhoodSources.js';

// Generic per-MSA neighborhood/hotspot scoring engine. Originally built
// Denver-only (denverNeighborhoods.ts); generalized so every market with
// a `neighborhoodSources.ts` entry gets the same choropleth for free.
//
// What's national (identical for every market): the Census ACS lookup
// (income/rent/population/rent-burden by tract) and the percentile-rank
// scoring math. What's per-market: only the boundary polygon layer
// (see neighborhoodSources.ts) — a different city GIS portal, different
// field names, different neighborhood count.

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const cacheFile = (market: MarketKey) => join(CACHE_DIR, `hotspots_${market}.json`);

const CENSUS_URL = (year: number) => `https://api.census.gov/data/${year}/acs/acs5`;
const CENSUS_GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

const VARS = ['B19013_001E', 'B01003_001E', 'B25064_001E', 'B25070_010E'];
// B19013_001E = median HH income, B01003_001E = population,
// B25064_001E = median gross rent, B25070_010E = rent burdened 50%+

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: Record<string, unknown>;
}

// In-memory cache, one slot per market.
const memCache = new Map<MarketKey, { data: GeoJsonFeatureCollection; ts: number }>();
const inflight = new Map<MarketKey, Promise<ProviderResult<GeoJsonFeatureCollection>>>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function fetchHotspots(market: MarketKey): Promise<ProviderResult<GeoJsonFeatureCollection>> {
  const provider = `${market}_hotspots`;
  const source = getNeighborhoodSource(market);
  if (!source) {
    return {
      provider,
      status: 'not_available',
      message: `No neighborhood boundary source configured for market '${market}' yet.`,
    };
  }

  if (!memCache.has(market)) await loadDiskCache(market);

  const hit = memCache.get(market);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: hit.data, fetchedAt: new Date(hit.ts).toISOString() };
  }

  const pending = inflight.get(market);
  if (pending) return pending;

  const task = doFetch(source);
  inflight.set(market, task);
  try {
    return await task;
  } finally {
    inflight.delete(market);
  }
}

// Kick off a background warm-up — resolves immediately, scoring happens async.
// Safe to call many times; coalesced internally per market.
export function warmHotspots(market: MarketKey): void {
  fetchHotspots(market).catch((e) => console.error(`[hotspots:${market}] warm failed:`, e));
}

async function loadDiskCache(market: MarketKey): Promise<void> {
  try {
    const raw = await readFile(cacheFile(market), 'utf8');
    const parsed = JSON.parse(raw) as { data: GeoJsonFeatureCollection; ts: number };
    if (parsed?.data?.features) {
      memCache.set(market, parsed);
      console.log(
        `[hotspots:${market}] loaded disk cache (${parsed.data.features.length} features, age ${Math.round(
          (Date.now() - parsed.ts) / 60000
        )}m)`
      );
    }
  } catch {
    // No cache file yet — that's fine.
  }
}

async function saveDiskCache(market: MarketKey): Promise<void> {
  const entry = memCache.get(market);
  if (!entry) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(market), JSON.stringify(entry));
  } catch (e) {
    console.warn(`[hotspots:${market}] could not persist cache:`, (e as Error).message);
  }
}

async function doFetch(source: NeighborhoodSource): Promise<ProviderResult<GeoJsonFeatureCollection>> {
  const { market } = source;
  const provider = `${market}_hotspots`;
  try {
    const url = new URL(source.queryUrl);
    url.searchParams.set('where', source.where || '1=1');
    url.searchParams.set('outFields', '*');
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('f', 'geojson');
    url.searchParams.set('resultRecordCount', '500');

    const res = await fetch(url);
    if (!res.ok) return { provider, status: 'error', message: `Neighborhoods HTTP ${res.status}` };
    const geojson = (await res.json()) as GeoJsonFeatureCollection;

    if (!geojson.features || geojson.features.length === 0) {
      return { provider, status: 'error', message: 'No neighborhood features returned' };
    }

    // Compute centroid for each neighborhood & score via Census
    const { geojson: scored, withData } = await scoreNeighborhoods(source, geojson);

    // If not a single neighborhood got real Census data (e.g. CENSUS_API_KEY
    // missing/invalid — Census now hard-requires a key, redirecting keyless
    // requests to an HTML "missing key" page instead of erroring), every
    // composite ties and the rank-normalization below maps "tied for last"
    // to "ranked 1st" for all of them — i.e. every neighborhood scores 95.
    // Fail loudly instead of serving that, and don't clobber a previously
    // good cache with it.
    if (withData === 0) {
      const message = `No neighborhoods returned usable Census data for '${market}' — check CENSUS_API_KEY is set and valid.`;
      const prevCache = memCache.get(market);
      if (prevCache) {
        console.warn(`[hotspots:${market}] ${message} Serving previous cache instead.`);
        return { provider, status: 'ok', data: prevCache.data, fetchedAt: new Date(prevCache.ts).toISOString() };
      }
      return { provider, status: 'error', message };
    }

    memCache.set(market, { data: scored, ts: Date.now() });
    void saveDiskCache(market);
    return { provider, status: 'ok', data: scored, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

async function scoreNeighborhoods(
  source: NeighborhoodSource,
  geojson: GeoJsonFeatureCollection
): Promise<{ geojson: GeoJsonFeatureCollection; withData: number }> {
  const { market, fallbackCenter } = source;
  const raw: Array<{ idx: number; income?: number; pop?: number; rent?: number; burdened?: number }> = [];
  const total = geojson.features.length;
  const t0 = Date.now();
  console.log(`[hotspots:${market}] scoring ${total} neighborhoods…`);

  // Compute all centroids up front (cheap, pure math).
  const tasks: Array<{ idx: number; lng: number; lat: number }> = [];
  for (let i = 0; i < total; i++) {
    const f = geojson.features[i];
    const [lng, lat] = computeCentroid(f.geometry, fallbackCenter);
    f.properties._centroid = [lng, lat];
    tasks.push({ idx: i, lng, lat });
  }

  // api.census.gov 503s on concurrent hits. Run one-at-a-time sequentially.
  // Cached 24h after that; the server warms this on boot so it almost
  // never blocks a user request. (See index.ts warmHotspots calls.)
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
  console.log(
    `[hotspots:${market}] scored ${total} in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${withData} with Census data`
  );

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
      rentGapScore * 0.3 +
      (popPct ?? 50) * 0.15 +
      (burdPct ?? 50) * 0.15 +
      50 * 0.15;
    rawScores.push(composite);
  }

  // Second pass: rank-normalize so the top neighborhood ≈ 95 and the bottom ≈ 20.
  // This spreads scores across the full range so the "90+ hot" tier is always
  // populated by this market's actually best neighborhoods, even if the
  // underlying composites are tight (true for small-count markets like
  // Phoenix's 15 villages).
  //
  // IMPORTANT: the displayed `score` is this market's RELATIVE rank, not an
  // absolute quality measure — the #1 neighborhood in any market always
  // lands near 95 even if every neighborhood's underlying numbers are
  // mediocre. A raw input (e.g. rentBurdenedPct, a single-tract household
  // COUNT, not a percentage despite the label) can look unremarkable while
  // the neighborhood still ranks HOT relative to its market's peers — see
  // the `breakdown` fields below, which expose the actual percentile inputs
  // and rank position so the "why" is inspectable instead of opaque.
  const sorted = [...rawScores].sort((a, b) => a - b);
  const n = sorted.length;
  const rankOrder = [...rawScores.keys()].sort((a, b) => rawScores[b] - rawScores[a]);
  const rankPositionByIdx = new Map<number, number>();
  rankOrder.forEach((scoreIdx, position) => rankPositionByIdx.set(scoreIdx, position + 1));

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const f = geojson.features[r.idx];
    const composite = rawScores[i];
    const rank = sorted.filter((s) => s <= composite).length / n;
    const score = Math.round(20 + rank * 75);

    f.properties.score = score;
    f.properties.medianIncome = r.income;
    f.properties.medianRent = r.rent;
    f.properties.population = r.pop;
    f.properties.rentBurdenedPct = r.burdened;
    // Normalized name field — every market writes into `nbhd_name` so the
    // frontend map/click-handler stays market-agnostic.
    f.properties.nbhd_name = source.nameOf(f.properties);

    // Explainability: the percentile inputs that produced `score`, plus
    // this neighborhood's rank position among its market's peers.
    f.properties.rankInMarket = rankPositionByIdx.get(i);
    f.properties.totalInMarket = n;
    f.properties.incomePercentile = percentile(r.income, incomes);
    f.properties.rentPercentile = percentile(r.rent, rents);
    f.properties.populationPercentile = percentile(r.pop, pops);
    f.properties.rentBurdenPercentile = percentile(r.burdened, burdens);
  }

  return { geojson, withData };
}

function computeCentroid(
  geometry: GeoJsonFeature['geometry'],
  fallbackCenter: [number, number]
): [number, number] {
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

  if (coords.length === 0) return fallbackCenter;
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

async function resolveToTract(
  lng: number,
  lat: number
): Promise<{ state: string; county: string; tract: string } | null> {
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
