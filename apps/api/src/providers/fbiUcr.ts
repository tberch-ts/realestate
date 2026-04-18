import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CrimeRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// FBI Crime Data Explorer (api.usa.gov/crime/fbi/cde) — agency-level violent crime.
// v1 hardcodes Denver PD ORI; expand to ORI-by-locality lookup later.

const NATIONAL_VIOLENT_RATE = 380.7; // per 100k, recent FBI UCR national baseline
const DENVER_PD_ORI = 'CODPD0000';
const DENVER_AGENCY_LABEL = 'Denver Police Department';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (FBI publishes annually)

interface CachedCrime { ts: number; payload: CrimeRecord; }

async function readCache(ori: string): Promise<CrimeRecord | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, `fbi_${ori}.json`), 'utf8');
    const cached = JSON.parse(raw) as CachedCrime;
    if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.payload;
  } catch { /* miss */ }
  return null;
}

async function writeCache(ori: string, payload: CrimeRecord): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      join(CACHE_DIR, `fbi_${ori}.json`),
      JSON.stringify({ ts: Date.now(), payload } satisfies CachedCrime),
    );
  } catch { /* best-effort */ }
}

function pickAgency(geocode: GeocodedAddress): { ori: string; label: string } | null {
  if (geocode.stateCode !== 'CO') return null;
  const locality = (geocode.components?.locality ?? '').toLowerCase();
  if (locality === 'denver') return { ori: DENVER_PD_ORI, label: DENVER_AGENCY_LABEL };
  return null;
}

interface FbiSummarizedResponse {
  offenses?: {
    rates?: Record<string, Record<string, number>>;   // 'Denver Police Department Offenses': { 'MM-YYYY': rate, ... }
    actuals?: Record<string, Record<string, number>>;
  };
  populations?: { population?: Record<string, Record<string, number>> };
}

// Sum 12 monthly per-100k rates within a year to get the annual rate per 100k.
// Returns the latest year that has all 12 months available.
function latestFullYearRate(
  body: FbiSummarizedResponse,
  agencyOffensesKey: string
): { year: number; rate: number } | null {
  const monthly = body.offenses?.rates?.[agencyOffensesKey];
  if (!monthly) return null;

  const byYear = new Map<number, number[]>();
  for (const [mmYYYY, rate] of Object.entries(monthly)) {
    const [, yyyy] = mmYYYY.split('-');
    const y = Number(yyyy);
    if (!Number.isFinite(y) || !Number.isFinite(rate)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(rate);
  }

  const fullYears = [...byYear.entries()]
    .filter(([, arr]) => arr.length === 12)
    .map(([y, arr]) => ({ year: y, rate: arr.reduce((s, n) => s + n, 0) }))
    .sort((a, b) => b.year - a.year);

  return fullYears[0] ?? null;
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

  const agency = pickAgency(geocode);
  if (!agency) {
    return {
      provider,
      status: 'not_available',
      message: `No FBI agency mapping for state=${geocode.stateCode} locality=${geocode.components?.locality ?? '?'}. v1 covers Denver only.`,
      data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
    };
  }

  const cached = await readCache(agency.ori);
  if (cached) {
    return { provider, status: 'ok', data: cached, fetchedAt: new Date().toISOString() };
  }

  // FBI date params are MM-YYYY (not YYYY). 5-year window so we always have a full year even if the latest isn't published.
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 4;
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${agency.ori}/violent-crime` +
    `?from=01-${startYear}&to=12-${endYear}&API_KEY=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `FBI API HTTP ${res.status}` };
    }
    const body = (await res.json()) as FbiSummarizedResponse;
    const latest = latestFullYearRate(body, `${agency.label} Offenses`);
    if (!latest) {
      return {
        provider,
        status: 'not_available',
        message: 'FBI response had no full-year violent-crime series for this agency',
        data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
      };
    }

    const record: CrimeRecord = {
      jurisdiction: agency.label,
      year: latest.year,
      violentCrimeRate: Math.round(latest.rate * 10) / 10,
      nationalAverageRate: NATIONAL_VIOLENT_RATE,
      belowAverage: latest.rate < NATIONAL_VIOLENT_RATE,
    };
    await writeCache(agency.ori, record);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
