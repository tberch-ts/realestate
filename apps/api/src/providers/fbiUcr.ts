import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CrimeRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// FBI Crime Data Explorer (api.usa.gov/crime/fbi/cde) — agency-level violent crime.
// Covers any city or county in Colorado by dynamically resolving locality -> ORI.
// Expand beyond CO by caching per-state agency lists the same way.

const NATIONAL_VIOLENT_RATE = 380.7; // per 100k, recent FBI UCR national baseline

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const AGENCY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d — agencies rarely change
const CRIME_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7d — FBI publishes annually

interface FbiAgency {
  ori: string;
  agency_name: string;
  agency_type_name?: string;
  counties?: string;
}
type AgencyIndex = {
  // lowercased city name -> ORI
  byCity: Record<string, { ori: string; label: string }>;
  // lowercased county name (no 'county' suffix) -> ORI of sheriff
  byCounty: Record<string, { ori: string; label: string }>;
};

interface CachedAgencyIndex { ts: number; state: string; index: AgencyIndex; }
interface CachedCrime { ts: number; payload: CrimeRecord; }

function normCity(s: string): string {
  return s.trim().toLowerCase();
}
function normCounty(s: string): string {
  return s.toLowerCase().replace(/\s+county$/, '').trim();
}

async function readCache<T>(file: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, file), 'utf8');
    const cached = JSON.parse(raw);
    if (cached && typeof cached.ts === 'number' && Date.now() - cached.ts < ttlMs) return cached as T;
  } catch { /* miss */ }
  return null;
}

async function writeCacheRaw(file: string, data: unknown): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, file), JSON.stringify(data));
  } catch { /* best-effort */ }
}

async function loadAgencyIndex(state: string, key: string): Promise<AgencyIndex | null> {
  const file = `fbi_agencies_${state}.json`;
  const cached = await readCache<CachedAgencyIndex>(file, AGENCY_CACHE_TTL_MS);
  if (cached && cached.state === state) return cached.index;

  try {
    const url = `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/${state}?API_KEY=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    // Response shape: { COUNTY_NAME: [ {ori, agency_name, agency_type_name, ...}, ... ], ... }
    const body = (await res.json()) as Record<string, FbiAgency[]>;

    const index: AgencyIndex = { byCity: {}, byCounty: {} };
    for (const [county, agencies] of Object.entries(body)) {
      for (const a of agencies) {
        const name = a.agency_name ?? '';
        const low = name.toLowerCase();
        if (low.includes('police')) {
          const city = name.replace(/ Police Department$/i, '').replace(/ Police$/i, '').trim();
          if (city) index.byCity[normCity(city)] = { ori: a.ori, label: name };
        } else if (low.includes('sheriff')) {
          // Sheriff "label" indexed by county name
          const c = normCounty(county);
          if (c && !(c in index.byCounty)) index.byCounty[c] = { ori: a.ori, label: name };
        }
      }
    }
    await writeCacheRaw(file, { ts: Date.now(), state, index } satisfies CachedAgencyIndex);
    return index;
  } catch {
    return null;
  }
}

function resolveAgency(
  geocode: GeocodedAddress,
  index: AgencyIndex
): { ori: string; label: string } | null {
  const city = normCity(geocode.components?.locality ?? '');
  if (city && index.byCity[city]) return index.byCity[city];

  // Google's county component is usually under administrative_area_level_2 like "Denver County"
  const rawCounty = geocode.components?.administrative_area_level_2 ?? '';
  const county = normCounty(rawCounty);
  if (county && index.byCounty[county]) return index.byCounty[county];

  return null;
}

interface FbiSummarizedResponse {
  offenses?: {
    rates?: Record<string, Record<string, number>>;
    actuals?: Record<string, Record<string, number>>;
  };
  populations?: { population?: Record<string, Record<string, number>> };
}

// Sum 12 monthly per-100k rates within a year to get the annual rate.
// Returns the latest year with all 12 months populated.
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

  const state = geocode.stateCode;
  if (state !== 'CO') {
    return {
      provider,
      status: 'not_available',
      message: `No FBI agency index cached for state=${state}. v1 covers Colorado only.`,
      data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
    };
  }

  const index = await loadAgencyIndex(state, key);
  if (!index) {
    return { provider, status: 'error', message: 'Failed to load FBI agency index for CO' };
  }

  const agency = resolveAgency(geocode, index);
  if (!agency) {
    return {
      provider,
      status: 'not_available',
      message: `No FBI agency match for locality="${geocode.components?.locality ?? '?'}" county="${geocode.components?.administrative_area_level_2 ?? '?'}"`,
      data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
    };
  }

  // Per-ORI crime cache
  const crimeFile = `fbi_crime_${agency.ori}.json`;
  const cached = await readCache<CachedCrime>(crimeFile, CRIME_CACHE_TTL_MS);
  if (cached) {
    return { provider, status: 'ok', data: cached.payload, fetchedAt: new Date().toISOString() };
  }

  // 5y window, MM-YYYY date format (not YYYY)
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 4;
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${agency.ori}/violent-crime` +
    `?from=01-${startYear}&to=12-${endYear}&API_KEY=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { provider, status: 'error', message: `FBI API HTTP ${res.status}` };
    const body = (await res.json()) as FbiSummarizedResponse;
    const latest = latestFullYearRate(body, `${agency.label} Offenses`);
    if (!latest) {
      return {
        provider,
        status: 'not_available',
        message: `FBI had no full-year series for ${agency.label}`,
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
    await writeCacheRaw(crimeFile, { ts: Date.now(), payload: record } satisfies CachedCrime);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}
