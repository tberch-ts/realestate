import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CrimeRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// FBI Crime Data Explorer (api.usa.gov/crime/fbi/cde) — agency-level violent crime.
// v1 hard-codes Denver PD ORI; expand to ORI-by-geocode lookup later.

const NATIONAL_VIOLENT_RATE = 380.7; // per 100k, recent FBI UCR national baseline
const DENVER_PD_ORI = 'CO0010100';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (FBI data is annual)

interface CachedCrime {
  ts: number;
  payload: CrimeRecord;
}

async function readCache(ori: string): Promise<CrimeRecord | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, `fbi_${ori}.json`), 'utf8');
    const cached = JSON.parse(raw) as CachedCrime;
    if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.payload;
  } catch {
    /* cache miss */
  }
  return null;
}

async function writeCache(ori: string, payload: CrimeRecord): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      join(CACHE_DIR, `fbi_${ori}.json`),
      JSON.stringify({ ts: Date.now(), payload } satisfies CachedCrime),
    );
  } catch {
    /* best-effort */
  }
}

function pickOri(geocode: GeocodedAddress): string | null {
  if (geocode.stateCode !== 'CO') return null;
  // Denver locality variants. Other CO cities can be added here as we expand.
  const locality = (geocode.components?.locality ?? '').toLowerCase();
  if (locality === 'denver') return DENVER_PD_ORI;
  return null;
}

interface FbiSummarizedResponse {
  // Real shape from cde.ucr.cjis.gov varies by endpoint version; we accept either.
  // Format A: { offenses: { actuals: { 'Violent Crime': {YYYY: n} } }, populations: { population: {YYYY: n} } }
  offenses?: { actuals?: Record<string, Record<string, number>> };
  populations?: { population?: Record<string, number> };
  // Format B: { data: [{ data_year, violent_crime, population }] }
  data?: Array<{
    data_year?: number;
    violent_crime?: number;
    population?: number;
  }>;
}

function extractLatestYearRate(body: FbiSummarizedResponse): {
  year: number;
  rate: number;
} | null {
  // Format A
  const actuals = body.offenses?.actuals;
  const pops = body.populations?.population;
  if (actuals && pops) {
    const violentSeries = actuals['Violent Crime'] ?? actuals['violent-crime'] ?? {};
    const years = Object.keys(violentSeries)
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y) && pops[String(y)])
      .sort((a, b) => b - a);
    if (years.length > 0) {
      const y = years[0];
      const v = violentSeries[String(y)];
      const p = pops[String(y)];
      if (p > 0 && Number.isFinite(v)) {
        return { year: y, rate: (v / p) * 100000 };
      }
    }
  }

  // Format B
  if (Array.isArray(body.data) && body.data.length > 0) {
    const sorted = [...body.data]
      .filter((r) => r.data_year && r.population && r.violent_crime !== undefined)
      .sort((a, b) => (b.data_year ?? 0) - (a.data_year ?? 0));
    if (sorted.length > 0) {
      const r = sorted[0];
      const p = r.population ?? 0;
      const v = r.violent_crime ?? 0;
      if (p > 0) return { year: r.data_year ?? 0, rate: (v / p) * 100000 };
    }
  }

  return null;
}

export async function fetchCrime(
  geocode: GeocodedAddress
): Promise<ProviderResult<CrimeRecord>> {
  const provider = 'fbi_ucr';
  const key = process.env.FBI_API_KEY;

  if (!key) {
    return {
      provider,
      status: 'needs_credentials',
      message:
        'FBI Crime Data Explorer requires a free api.data.gov key. Register at https://api.data.gov/signup/ and set FBI_API_KEY.',
    };
  }

  const ori = pickOri(geocode);
  if (!ori) {
    return {
      provider,
      status: 'not_available',
      message: `No FBI agency mapping for state=${geocode.stateCode} locality=${geocode.components?.locality ?? '?'}. v1 covers Denver only.`,
      data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
    };
  }

  const cached = await readCache(ori);
  if (cached) {
    return { provider, status: 'ok', data: cached, fetchedAt: new Date().toISOString() };
  }

  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 4; // 5-year window — handles years where the latest isn't published yet
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/violent-crime` +
    `?from=${startYear}&to=${endYear}&API_KEY=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        provider,
        status: 'error',
        message: `FBI API HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as FbiSummarizedResponse;
    const latest = extractLatestYearRate(body);
    if (!latest) {
      return {
        provider,
        status: 'not_available',
        message: 'FBI response had no parseable violent-crime + population series',
        data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
      };
    }

    const record: CrimeRecord = {
      jurisdiction: geocode.components?.locality ?? 'Denver',
      year: latest.year,
      violentCrimeRate: Math.round(latest.rate * 10) / 10,
      nationalAverageRate: NATIONAL_VIOLENT_RATE,
      belowAverage: latest.rate < NATIONAL_VIOLENT_RATE,
    };
    await writeCache(ori, record);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
