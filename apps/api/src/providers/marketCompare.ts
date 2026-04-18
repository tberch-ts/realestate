import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_TABLE } from './landlordFriendliness.js';

// Static metro panel — Denver + 17 candidates that share Denver's investment thesis
// (mid-tier MSA, urban core, multifamily inventory, Mountain-West / Sun-Belt growth).
// Each row: city + state + the LARGEST county containing it (Census FIPS, 5-digit).

interface MetroDef {
  name: string;
  state: string;
  city: string;          // matches FBI agency_name (without 'Police Department') when possible
  countyFips: string;    // 5-digit Census FIPS for the largest county
  oriOverride?: { ori: string; label: string }; // for agencies that don't follow "{City} Police Department" naming
}

export const METROS: MetroDef[] = [
  // Colorado (the home market + nearest analogs)
  { name: 'Denver',           state: 'CO', city: 'Denver',           countyFips: '08031' },
  { name: 'Colorado Springs', state: 'CO', city: 'Colorado Springs', countyFips: '08041' },
  { name: 'Boulder',          state: 'CO', city: 'Boulder',          countyFips: '08013' },
  { name: 'Fort Collins',     state: 'CO', city: 'Fort Collins',     countyFips: '08069' },
  { name: 'Aurora',           state: 'CO', city: 'Aurora',           countyFips: '08005' },
  // Mountain West analogs
  { name: 'Salt Lake City',   state: 'UT', city: 'Salt Lake City',   countyFips: '49035' },
  { name: 'Boise',            state: 'ID', city: 'Boise',            countyFips: '16001' },
  { name: 'Reno',             state: 'NV', city: 'Reno',             countyFips: '32031' },
  { name: 'Albuquerque',      state: 'NM', city: 'Albuquerque',      countyFips: '35001' },
  // Sun Belt analogs
  { name: 'Phoenix',          state: 'AZ', city: 'Phoenix',          countyFips: '04013' },
  { name: 'Tucson',           state: 'AZ', city: 'Tucson',           countyFips: '04019' },
  { name: 'Las Vegas',        state: 'NV', city: 'Las Vegas',        countyFips: '32003',
    oriOverride: { ori: 'NV0020100', label: 'Las Vegas Metropolitan Police Department' } },
  { name: 'Austin',           state: 'TX', city: 'Austin',           countyFips: '48453' },
  { name: 'San Antonio',      state: 'TX', city: 'San Antonio',      countyFips: '48029' },
  { name: 'Nashville',        state: 'TN', city: 'Nashville',        countyFips: '47037',
    oriOverride: { ori: 'TN0190100', label: 'Metropolitan Nashville Police Department' } },
  { name: 'Charlotte',        state: 'NC', city: 'Charlotte',        countyFips: '37119',
    oriOverride: { ori: 'NC0600100', label: 'Charlotte-Mecklenburg Police Department' } },
  { name: 'Raleigh',          state: 'NC', city: 'Raleigh',          countyFips: '37183' },
  { name: 'Tampa',            state: 'FL', city: 'Tampa',            countyFips: '12057' },
  // Coastal but profile-similar
  { name: 'Portland',         state: 'OR', city: 'Portland',         countyFips: '41051' },
  { name: 'Seattle',          state: 'WA', city: 'Seattle',          countyFips: '53033' },
];

interface MarketRow {
  name: string;
  state: string;
  population?: number;
  medianIncome?: number;
  medianRent?: number;
  rentBurdenedPct?: number;          // % of renters paying 50%+ of income
  rentToIncomeRatio?: number;         // medianRent*12 / medianIncome
  violentCrimeRate?: number;          // per 100k, latest full year
  crimeYear?: number;
  crimeJurisdiction?: string;
  landlordScore: number;              // 0-100, state-level
  landlordTier: 'friendly' | 'moderate' | 'unfriendly';
  landlordNotes?: string;
  // Computed scores (filled in after all rows fetched)
  similarityToDenver?: number;        // 0-100, higher = more like Denver
  investability?: number;             // 0-100, higher = better climate (vs Denver as baseline)
  errors?: string[];                  // collected per-source failures (for transparency)
}

// ---- Census ACS at county level ----
const CENSUS_VARS = ['B19013_001E', 'B01003_001E', 'B25064_001E', 'B25070_010E'];
// B19013 = median HH income, B01003 = pop, B25064 = median rent, B25070_010 = rent burdened 50%+

async function fetchCensusCounty(stateFips: string, countyFips: string): Promise<{
  income?: number; pop?: number; rent?: number; burdenedRaw?: number;
} | null> {
  const year = 2023;
  const key = process.env.CENSUS_API_KEY;
  const url =
    `https://api.census.gov/data/${year}/acs/acs5` +
    `?get=${CENSUS_VARS.join(',')}` +
    `&for=county:${countyFips}&in=state:${stateFips}` +
    (key ? `&key=${encodeURIComponent(key)}` : '');
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as string[][];
  // [headerRow, [income, pop, rent, burdened, state, county]]
  if (!Array.isArray(body) || body.length < 2) return null;
  const row = body[1];
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return {
    income: num(row[0]),
    pop: num(row[1]),
    rent: num(row[2]),
    burdenedRaw: num(row[3]),
  };
}

// ---- FBI agency index per state (cached 30d) ----
interface FbiAgency { ori: string; agency_name: string; agency_type_name?: string; }
type AgencyIndex = { byCity: Record<string, { ori: string; label: string }> };
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const AGENCY_TTL = 30 * 24 * 60 * 60 * 1000;
const CRIME_TTL  =  7 * 24 * 60 * 60 * 1000;

async function readJson<T>(file: string, ttl: number): Promise<T | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === 'number' && Date.now() - parsed.ts < ttl) return parsed as T;
  } catch { /* miss */ }
  return null;
}
async function writeJson(file: string, data: unknown): Promise<void> {
  try { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(join(CACHE_DIR, file), JSON.stringify(data)); } catch {}
}

async function getAgencyIndex(state: string, key: string): Promise<AgencyIndex | null> {
  const file = `fbi_agencies_${state}.json`;
  const cached = await readJson<{ ts: number; index: AgencyIndex }>(file, AGENCY_TTL);
  if (cached) return cached.index;

  try {
    const url = `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/${state}?API_KEY=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, FbiAgency[]>;
    const index: AgencyIndex = { byCity: {} };
    for (const agencies of Object.values(body)) {
      for (const a of agencies) {
        const name = a.agency_name ?? '';
        if (!name.toLowerCase().includes('police')) continue;
        const city = name.replace(/ Police Department$/i, '').replace(/ Police$/i, '').trim().toLowerCase();
        if (city && !(city in index.byCity)) index.byCity[city] = { ori: a.ori, label: name };
      }
    }
    await writeJson(file, { ts: Date.now(), index });
    return index;
  } catch { return null; }
}

interface FbiSummarized {
  offenses?: { rates?: Record<string, Record<string, number>> };
}
function annualRate(body: FbiSummarized, label: string): { year: number; rate: number } | null {
  const monthly = body.offenses?.rates?.[label];
  if (!monthly) return null;
  const byYear = new Map<number, number[]>();
  for (const [k, v] of Object.entries(monthly)) {
    const y = Number(k.split('-')[1]);
    if (Number.isFinite(y) && Number.isFinite(v)) {
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(v);
    }
  }
  const full = [...byYear.entries()]
    .filter(([, arr]) => arr.length === 12)
    .map(([y, arr]) => ({ year: y, rate: arr.reduce((s, n) => s + n, 0) }))
    .sort((a, b) => b.year - a.year);
  return full[0] ?? null;
}

async function fetchAgencyCrime(ori: string, label: string, key: string): Promise<{ year: number; rate: number } | null> {
  const file = `fbi_crime_${ori}.json`;
  const cached = await readJson<{ ts: number; year: number; rate: number }>(file, CRIME_TTL);
  if (cached) return { year: cached.year, rate: cached.rate };

  const endY = new Date().getFullYear() - 1;
  const startY = endY - 4;
  const url =
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/violent-crime` +
    `?from=01-${startY}&to=12-${endY}&API_KEY=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as FbiSummarized;
    const latest = annualRate(body, `${label} Offenses`);
    if (!latest) return null;
    await writeJson(file, { ts: Date.now(), year: latest.year, rate: latest.rate });
    return latest;
  } catch { return null; }
}

// ---- Per-metro fetch ----
async function fetchMetro(m: MetroDef): Promise<MarketRow> {
  const errors: string[] = [];
  const stateFips = m.countyFips.slice(0, 2);
  const countyFips = m.countyFips.slice(2);

  const census = await fetchCensusCounty(stateFips, countyFips).catch(() => null);
  if (!census) errors.push('census fetch failed');

  // FBI: prefer the hardcoded ORI override, else look up by city in the state index.
  let crime: { year: number; rate: number } | null = null;
  let crimeJurisdiction: string | undefined;
  const fbiKey = process.env.FBI_API_KEY;
  if (fbiKey) {
    let agency: { ori: string; label: string } | undefined = m.oriOverride;
    if (!agency) {
      const idx = await getAgencyIndex(m.state, fbiKey);
      if (!idx) errors.push(`fbi index ${m.state} unavailable`);
      else {
        agency = idx.byCity[m.city.toLowerCase()];
        if (!agency) errors.push(`fbi: no PD match for "${m.city}"`);
      }
    }
    if (agency) {
      crime = await fetchAgencyCrime(agency.ori, agency.label, fbiKey);
      crimeJurisdiction = agency.label;
      if (!crime) errors.push('fbi crime fetch failed');
    }
  } else {
    errors.push('no FBI_API_KEY');
  }

  const land = STATE_TABLE[m.state];
  const burdenedPct = census?.burdenedRaw && census?.pop ? (census.burdenedRaw / census.pop) * 100 : undefined;
  const rentToIncome = census?.rent && census?.income ? (census.rent * 12) / census.income : undefined;

  return {
    name: m.name,
    state: m.state,
    population: census?.pop,
    medianIncome: census?.income,
    medianRent: census?.rent,
    rentBurdenedPct: burdenedPct ? Math.round(burdenedPct * 10) / 10 : undefined,
    rentToIncomeRatio: rentToIncome ? Math.round(rentToIncome * 1000) / 1000 : undefined,
    violentCrimeRate: crime ? Math.round(crime.rate * 10) / 10 : undefined,
    crimeYear: crime?.year,
    crimeJurisdiction,
    landlordScore: land?.score ?? 0,
    landlordTier: land?.tier ?? 'moderate',
    landlordNotes: land?.notes,
    errors: errors.length ? errors : undefined,
  };
}

// ---- Scoring ----
// Similarity: how close is this market to Denver's PROFILE (size + income + rent).
// 100 = identical Denver; drops to 0 as any axis drifts out of range.
function similarity(a: MarketRow, denver: MarketRow): number {
  const parts: Array<{ v: number; w: number }> = [];
  if (a.population && denver.population) {
    const dist = Math.abs(Math.log10(a.population) - Math.log10(denver.population));
    parts.push({ v: Math.max(0, 1 - dist / 0.5), w: 0.4 });  // within ±3x Denver pop
  }
  if (a.medianIncome && denver.medianIncome) {
    const pct = Math.abs(a.medianIncome - denver.medianIncome) / denver.medianIncome;
    parts.push({ v: Math.max(0, 1 - pct / 0.4), w: 0.3 });   // within ±40%
  }
  if (a.medianRent && denver.medianRent) {
    const pct = Math.abs(a.medianRent - denver.medianRent) / denver.medianRent;
    parts.push({ v: Math.max(0, 1 - pct / 0.4), w: 0.3 });
  }
  if (parts.length === 0) return 0;
  const tw = parts.reduce((s, p) => s + p.w, 0);
  const wsum = parts.reduce((s, p) => s + p.v * p.w, 0);
  return Math.round((wsum / tw) * 100);
}

// Investability: centered at 50 = parity with Denver. Each axis can push ±25 from center.
// Axes (total ±50 possible):
//   landlord (±20) — state regulatory tilt delta from CO's 55
//   crime (±20)    — percent lower than Denver's violent crime rate
//   affordability (±10) — rent/income ratio lower than Denver
// Result is clamped to [0, 100]. A score of 50 = "same as Denver"; 70 = "materially better";
// 30 = "materially worse". Keeps dynamic range without saturating the top.
function investability(a: MarketRow, denver: MarketRow): number {
  let score = 50;

  // Landlord: delta in score, mapped to ±20 (max delta ~60 between extremes like AR:90 and NY:28).
  const landlordDelta = a.landlordScore - denver.landlordScore;
  score += Math.max(-20, Math.min(20, landlordDelta * (20 / 30))); // 30-point delta -> full 20-point swing

  // Crime: pct-lower than Denver, mapped to ±20 (cap at 2x or 0.5x).
  if (a.violentCrimeRate && denver.violentCrimeRate) {
    const pctLower = (denver.violentCrimeRate - a.violentCrimeRate) / denver.violentCrimeRate;
    score += Math.max(-20, Math.min(20, pctLower * 40));  // pctLower=0.5 -> +20
  }

  // Affordability: pct-lower rent/income ratio vs Denver, mapped to ±10.
  if (a.rentToIncomeRatio && denver.rentToIncomeRatio) {
    const pctLower = (denver.rentToIncomeRatio - a.rentToIncomeRatio) / denver.rentToIncomeRatio;
    score += Math.max(-10, Math.min(10, pctLower * 40));
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---- Public entry: cached 7d ----
const RESULT_FILE = 'markets_compare.json';
interface Cached { ts: number; rows: MarketRow[]; }

export async function compareMarkets(opts: { force?: boolean } = {}): Promise<MarketRow[]> {
  if (!opts.force) {
    const cached = await readJson<Cached>(RESULT_FILE, CRIME_TTL);
    if (cached) return cached.rows;
  }

  const rows = await Promise.all(METROS.map(fetchMetro));
  const denver = rows.find((r) => r.name === 'Denver');
  if (denver) {
    for (const r of rows) {
      r.similarityToDenver = similarity(r, denver);
      r.investability = investability(r, denver);
    }
  }
  rows.sort((a, b) => (b.investability ?? 0) - (a.investability ?? 0));
  await writeJson(RESULT_FILE, { ts: Date.now(), rows } satisfies Cached);
  return rows;
}
