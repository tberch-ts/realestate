import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FollowupProperty,
  FollowupScored,
  OwnerCluster,
  OwnerType,
  ProviderResult,
} from '@mfa/shared';

// Same ArcGIS layer as denverFollowup.ts but queried city-wide (no polygon) so we
// can aggregate ownership across all of Denver (clustering + out-of-state filters).
const MIDDLE_HOUSING_URL =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/Middle_Housing_Stock/FeatureServer/0/query';

const CACHE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.cache/denver_portfolio.json'
);
const CACHE_TTL = 24 * 60 * 60 * 1000;

type PortfolioRow = FollowupScored;

interface PortfolioCache {
  ts: number;
  params: { minUnits: number; minYear: number };
  rows: PortfolioRow[];
}

let memCache: PortfolioCache | null = null;
let inflight: Promise<PortfolioCache> | null = null;

// ---------- Public API ----------

export async function fetchDenverPortfolio(opts: {
  minUnits?: number;
  minYear?: number;
} = {}): Promise<ProviderResult<{ rows: PortfolioRow[]; fetchedAt: string }>> {
  const provider = 'denver_portfolio';
  const minUnits = opts.minUnits ?? 100;
  const minYear = opts.minYear ?? 1990;

  try {
    const data = await ensureCache({ minUnits, minYear });
    return {
      provider,
      status: 'ok',
      data: { rows: data.rows, fetchedAt: new Date(data.ts).toISOString() },
      fetchedAt: new Date(data.ts).toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

export async function fetchDenverOwners(opts: {
  minUnits?: number;
  minYear?: number;
  outOfStateOnly?: boolean;
  search?: string;
  limit?: number;
} = {}): Promise<ProviderResult<{ clusters: OwnerCluster[] }>> {
  const provider = 'denver_owners';
  const minUnits = opts.minUnits ?? 100;
  const minYear = opts.minYear ?? 1990;

  try {
    const data = await ensureCache({ minUnits, minYear });
    const clusters = groupByOwner(data.rows);

    let filtered = clusters;
    if (opts.outOfStateOnly) filtered = filtered.filter((c) => c.outOfState);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      filtered = filtered.filter((c) => c.owner.toLowerCase().includes(q));
    }
    // Rank by total units desc (bigger portfolios first)
    filtered.sort((a, b) => b.totalUnits - a.totalUnits);
    if (opts.limit) filtered = filtered.slice(0, opts.limit);

    return { provider, status: 'ok', data: { clusters: filtered } };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

export async function fetchOwnerPortfolio(owner: string, opts: {
  minUnits?: number;
  minYear?: number;
} = {}): Promise<ProviderResult<OwnerCluster | null>> {
  const provider = 'denver_owner';
  const minUnits = opts.minUnits ?? 100;
  const minYear = opts.minYear ?? 1990;

  try {
    const data = await ensureCache({ minUnits, minYear });
    const clusters = groupByOwner(data.rows);
    const target = owner.toLowerCase();
    const hit = clusters.find((c) => c.owner.toLowerCase() === target);
    return { provider, status: 'ok', data: hit ?? null };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

// Kick warm cache async on boot.
export function warmDenverPortfolio(): void {
  ensureCache({ minUnits: 100, minYear: 1990 }).catch((e) =>
    console.error('[portfolio] warm failed:', (e as Error).message)
  );
}

// ---------- Internals ----------

async function ensureCache(params: { minUnits: number; minYear: number }): Promise<PortfolioCache> {
  // Only cache one (minUnits, minYear) combo. If caller asks for different, refetch.
  const key = (p: { minUnits: number; minYear: number }) => `${p.minUnits}:${p.minYear}`;

  if (memCache && key(memCache.params) === key(params) && Date.now() - memCache.ts < CACHE_TTL) {
    return memCache;
  }
  if (!memCache) await loadDiskCache();
  if (memCache && key(memCache.params) === key(params) && Date.now() - memCache.ts < CACHE_TTL) {
    return memCache;
  }
  if (inflight) return inflight;

  inflight = doFetch(params);
  try {
    memCache = await inflight;
    void saveDiskCache();
    return memCache;
  } finally {
    inflight = null;
  }
}

async function loadDiskCache(): Promise<void> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PortfolioCache;
    if (parsed?.rows?.length) {
      memCache = parsed;
      console.log(
        `[portfolio] loaded disk cache (${parsed.rows.length} rows, age ${Math.round(
          (Date.now() - parsed.ts) / 60000
        )}m)`
      );
    }
  } catch {
    // no cache yet
  }
}

async function saveDiskCache(): Promise<void> {
  if (!memCache) return;
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(memCache));
  } catch (e) {
    console.warn('[portfolio] cache save failed:', (e as Error).message);
  }
}

async function doFetch(params: { minUnits: number; minYear: number }): Promise<PortfolioCache> {
  const t0 = Date.now();
  console.log(`[portfolio] fetching Denver city-wide (${params.minUnits}+ units, ${params.minYear}+)`);

  const where =
    `(EST_UNITS >= ${params.minUnits} OR TOT_UNITS >= ${params.minUnits}) ` +
    `AND (COALESCE(COM_ORIG_YEAR_BUILT, RES_ORIG_YEAR_BUILT) >= ${params.minYear} ` +
    `  OR RES_ORIG_YEAR_BUILT >= ${params.minYear} ` +
    `  OR COM_ORIG_YEAR_BUILT >= ${params.minYear})`;

  const rows: PortfolioRow[] = [];
  let resultOffset = 0;
  const pageSize = 200;
  for (let page = 0; page < 20; page++) {
    const url = new URL(MIDDLE_HOUSING_URL);
    const body = new URLSearchParams({
      where,
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
      resultRecordCount: String(pageSize),
      resultOffset: String(resultOffset),
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const json = (await res.json()) as {
      features?: Array<{ attributes: Record<string, unknown>; geometry?: unknown }>;
      exceededTransferLimit?: boolean;
      error?: { message: string };
    };
    if (json.error) throw new Error(json.error.message);
    const batch = json.features ?? [];
    if (batch.length === 0) break;
    for (const f of batch) {
      const prop = toFollowupProperty(f.attributes, f.geometry);
      if (prop && (prop.units ?? 0) >= params.minUnits) {
        rows.push(scoreRow(prop));
      }
    }
    if (!json.exceededTransferLimit || batch.length < pageSize) break;
    resultOffset += pageSize;
  }

  const unique = dedupeByParcel(rows);
  console.log(`[portfolio] fetched ${unique.length} unique properties in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { ts: Date.now(), params, rows: unique };
}

function dedupeByParcel(rows: PortfolioRow[]): PortfolioRow[] {
  const seen = new Map<string, PortfolioRow>();
  for (const r of rows) {
    const key = r.parcelId ?? r.address.toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

function groupByOwner(rows: PortfolioRow[]): OwnerCluster[] {
  const map = new Map<string, OwnerCluster>();
  for (const r of rows) {
    const owner = (r.owner ?? 'UNKNOWN OWNER').trim();
    const keyLower = owner.toLowerCase();
    let cluster = map.get(keyLower);
    if (!cluster) {
      cluster = {
        owner,
        ownerType: r.signals.ownerType,
        mailingState: r.ownerMailingState,
        outOfState: !!r.signals.outOfStateOwner,
        propertyCount: 0,
        totalUnits: 0,
        properties: [],
      };
      map.set(keyLower, cluster);
    }
    cluster.propertyCount += 1;
    cluster.totalUnits += r.units ?? 0;
    cluster.properties.push(r);
    // Prefer the most-common ownerType/mailingState seen (first-wins is fine for v1)
    if (!cluster.mailingState && r.ownerMailingState) cluster.mailingState = r.ownerMailingState;
  }
  // Compute avg year built
  for (const c of map.values()) {
    const years = c.properties.map((p) => p.yearBuilt).filter(Boolean) as number[];
    if (years.length > 0) {
      c.avgYearBuilt = Math.round(years.reduce((s, y) => s + y, 0) / years.length);
    }
  }
  return Array.from(map.values());
}

// ---- Property transform (mirrors denverFollowup.ts for consistency) ----

function toFollowupProperty(
  a: Record<string, unknown>,
  geometry: unknown
): FollowupProperty | null {
  const line1 = str(a.SITUS_ADDRESS_LINE1);
  const nbr = str(a.SITUS_ADDR_NBR);
  const suf = str(a.SITUS_ADDR_NBR_SUFFIX);
  const address = line1 ?? [nbr, suf].filter(Boolean).join(' ').trim();
  if (!address) return null;

  const units = num(a.EST_UNITS) ?? num(a.TOT_UNITS);
  const year = num(a.COM_ORIG_YEAR_BUILT) ?? num(a.RES_ORIG_YEAR_BUILT);
  const sqft = num(a.COM_GROSS_AREA) ?? num(a.COM_NET_AREA) ?? num(a.RES_ABOVE_GRADE_AREA);

  const saleYear = num(a.SALE_YEAR);
  const saleMd = str(a.SALE_MONTHDAY);
  let saleDate: string | undefined;
  if (saleYear && saleMd && saleMd.length === 4) {
    saleDate = `${saleYear}-${saleMd.slice(0, 2)}-${saleMd.slice(2, 4)}`;
  } else if (a.SALE_DATE) {
    const t = Number(a.SALE_DATE);
    if (Number.isFinite(t) && t > 0) saleDate = new Date(t).toISOString().slice(0, 10);
  }

  const centroid = centroidFromGeometry(geometry);

  return {
    parcelId: str(a.SITUS_ADDRESS_ID),
    address,
    owner: str(a.OWNER_NAME),
    ownerMailingState: str(a.OWNER_STATE),
    units,
    yearBuilt: year,
    salePrice: num(a.SALE_PRICE),
    saleDate,
    sqft,
    propertyClass: str(a.D_CLASS_CN) ?? str(a.PROP_CLASS),
    centroid,
  };
}

function scoreRow(p: FollowupProperty): FollowupScored {
  const reasons: string[] = [];
  const now = new Date();

  let yearsHeld: number | undefined;
  if (p.saleDate) {
    const saleYear = Number(p.saleDate.slice(0, 4));
    if (Number.isFinite(saleYear) && saleYear > 1900) yearsHeld = now.getFullYear() - saleYear;
  }
  const holdScore =
    yearsHeld == null ? 50 : Math.max(0, Math.min(100, (yearsHeld - 3) * 14.3));
  if (yearsHeld != null && yearsHeld >= 7) reasons.push(`Owner has held ${yearsHeld}y`);

  const ownerType = classifyOwner(p.owner);
  const ownerScore =
    ownerType === 'individual' ? 95 : ownerType === 'llc' ? 75 : ownerType === 'institutional' ? 20 : 50;
  if (ownerType === 'individual') reasons.push('Individual/trust owner');
  else if (ownerType === 'llc') reasons.push('Small LLC owner');
  else if (ownerType === 'institutional') reasons.push('Institutional owner');

  const outOfStateOwner = p.ownerMailingState ? p.ownerMailingState.toUpperCase() !== 'CO' : undefined;
  if (outOfStateOwner) reasons.push(`Out-of-state owner (${p.ownerMailingState})`);

  const recency = yearsHeld == null ? 50 : Math.max(0, 100 - yearsHeld * 5);
  const composite = Math.round(
    holdScore * 0.50 + ownerScore * 0.35 + recency * 0.10 + (outOfStateOwner ? 5 : 0)
  );

  return {
    ...p,
    score: Math.max(0, Math.min(100, composite)),
    signals: { yearsHeld, ownerType, outOfStateOwner },
    reasons,
  };
}

function classifyOwner(raw?: string): OwnerType {
  if (!raw) return 'unknown';
  const n = raw.toUpperCase();
  const institutionalKeywords = [
    'REIT', 'CAPITAL', 'EQUITY', 'FUND', 'PROPERTIES INC', 'PROPERTIES CORP',
    'HOLDINGS', 'INVESTMENTS INC', 'MANAGEMENT', 'PARTNERS LP', 'ASSOC LP',
    'REAL ESTATE TRUST', 'OPERATING PARTNER', 'RESIDENTIAL INC',
    'APARTMENT COMMUNITIES', 'APARTMENTS INC', 'APARTMENTS CORP',
    'ESSEX', 'AVALONBAY', 'CAMDEN', 'UDR', 'EQUITY RESIDENTIAL',
    'AIMCO', 'MID-AMERICA', 'GREYSTAR', 'SECURITY PROPERTIES',
    'RELATED COMPANIES', 'LINCOLN PROPERTY', 'BELL PARTNERS',
    'BLACKSTONE', 'STARWOOD', 'LIV COMMUNITIES', 'ALLIANT',
    'STEADFAST', 'MILL CREEK', 'TRANSWESTERN',
  ];
  for (const kw of institutionalKeywords) if (n.includes(kw)) return 'institutional';
  if (/\bLLC\b/.test(n)) return 'llc';
  if (/\bLP\b/.test(n)) return 'llc';
  if (n.includes('TRUST') && !n.includes('REAL ESTATE TRUST')) return 'individual';
  if (/^[A-Z\- .']+,\s*[A-Z\- .']+$/.test(n)) return 'individual';
  return 'unknown';
}

function centroidFromGeometry(geometry: unknown): [number, number] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geometry as any;
  const rings: number[][][] = g?.rings ?? (g?.coordinates ?? []);
  const coords: number[][] = [];
  const collect = (arr: unknown[]): void => {
    if (typeof arr[0] === 'number') {
      coords.push(arr as number[]);
    } else {
      for (const sub of arr) collect(sub as unknown[]);
    }
  };
  collect(rings as unknown[]);
  if (coords.length === 0) return [-104.99, 39.74];
  const sx = coords.reduce((s, c) => s + c[0], 0);
  const sy = coords.reduce((s, c) => s + c[1], 0);
  return [sx / coords.length, sy / coords.length];
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim();
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
