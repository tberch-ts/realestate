import type { LandLeadFilters, LandLeadScored, LandParcel, OwnerType } from '@mfa/shared';

// Shared helpers for the per-county vacant-land providers (wakeLand.ts,
// hillsboroughLand.ts, ...). Deliberately NOT extracted from
// denverFollowup.ts — followup keeps its own copies so the multifamily
// pipeline can't regress while land iterates.

// Server-side defaults for the lead filters. minYearsHeld = 10 is the
// strategy's key rule: talk to owners who've held for a decade+, never
// recent purchasers.
export const LAND_FILTER_DEFAULTS = {
  minYearsHeld: 10,
  includeUnknownSaleDate: true,
  limit: 200,
  maxLimit: 500,
} as const;

export function normalizeFilters(f: LandLeadFilters): Required<Pick<LandLeadFilters, 'minYearsHeld' | 'includeUnknownSaleDate' | 'limit'>> & LandLeadFilters {
  return {
    ...f,
    minYearsHeld: f.minYearsHeld ?? LAND_FILTER_DEFAULTS.minYearsHeld,
    includeUnknownSaleDate: f.includeUnknownSaleDate ?? LAND_FILTER_DEFAULTS.includeUnknownSaleDate,
    limit: Math.min(f.limit ?? LAND_FILTER_DEFAULTS.limit, LAND_FILTER_DEFAULTS.maxLimit),
  };
}

export function filtersCacheKey(market: string, f: LandLeadFilters): string {
  // Deterministic key: sorted entries of the normalized filter object.
  const n = normalizeFilters(f);
  const entries = Object.entries(n)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? [...v].sort().join('|') : String(v)}`)
    .sort();
  return `${market}:${entries.join(';')}`;
}

export function yearsHeldFrom(saleDate: string | undefined): number | undefined {
  if (!saleDate) return undefined;
  const saleYear = Number(saleDate.slice(0, 4));
  if (!Number.isFinite(saleYear) || saleYear < 1900) return undefined;
  return new Date().getFullYear() - saleYear;
}

// Post-query filtering that ArcGIS `where` can't express (or that we apply
// uniformly regardless of county field quirks): hold time + owner location.
export function applyOwnershipFilters(parcels: LandParcel[], f: LandLeadFilters, homeState: string): LandParcel[] {
  const n = normalizeFilters(f);
  return parcels.filter((p) => {
    const years = yearsHeldFrom(p.saleDate);
    if (years == null) {
      if (!n.includeUnknownSaleDate) return false;
    } else if (years < n.minYearsHeld) {
      return false;
    }
    if (n.outOfStateOwner && p.ownerMailingState && p.ownerMailingState.toUpperCase() === homeState.toUpperCase()) {
      return false;
    }
    if (n.outOfCountyOwner && p.outOfCountyOwner === false) return false;
    return true;
  });
}

// Contact-priority score for a vacant-lot owner. Weights mirror the
// followup scorer's philosophy but tuned for land: hold time dominates
// (the strategy explicitly targets decade-plus owners), then owner type,
// then absentee signals.
export function scoreLandLead(p: LandParcel, homeState: string): LandLeadScored {
  const reasons: string[] = [];

  const yearsHeld = yearsHeldFrom(p.saleDate);
  // 10y+ = max. No recorded sale usually means decades-held (pre-digital
  // records) — treat as strong, with an explicit reason chip.
  let holdScore: number;
  if (yearsHeld == null) {
    holdScore = 85;
    reasons.push('No recorded sale — likely decades-held');
  } else {
    holdScore = Math.max(0, Math.min(100, (yearsHeld / 10) * 100));
    if (yearsHeld >= 10) reasons.push(`Owner has held ${yearsHeld}y`);
  }

  const ownerType = classifyLandOwner(p.owner);
  const ownerScore = ownerType === 'individual' ? 95 : ownerType === 'llc' ? 60 : ownerType === 'institutional' ? 10 : 50;
  if (ownerType === 'individual') reasons.push('Individual/trust owner');
  else if (ownerType === 'llc') reasons.push('LLC owner');
  else if (ownerType === 'institutional') reasons.push('Institutional/public owner');

  const outOfStateOwner = p.ownerMailingState
    ? p.ownerMailingState.toUpperCase() !== homeState.toUpperCase()
    : undefined;
  if (outOfStateOwner) reasons.push(`Out-of-state owner (${p.ownerMailingState})`);
  if (p.outOfCountyOwner) reasons.push('Out-of-county owner');

  const composite = Math.round(
    holdScore * 0.5 +
      ownerScore * 0.3 +
      (outOfStateOwner ? 10 : 0) +
      (p.outOfCountyOwner ? 10 : 0)
  );

  return {
    ...p,
    score: Math.max(0, Math.min(100, composite)),
    signals: { yearsHeld, ownerType, outOfStateOwner, outOfCountyOwner: p.outOfCountyOwner },
    reasons,
  };
}

// Owner-name classifier for land: same shape as followup's but with
// public-entity keywords added (counties/states/utilities own a lot of
// vacant land and are not sellable leads).
export function classifyLandOwner(raw?: string): OwnerType {
  if (!raw) return 'unknown';
  const n = raw.toUpperCase();

  const institutionalKeywords = [
    'COUNTY', 'CITY OF', 'STATE OF', 'FLORIDA DEPT', 'DEPARTMENT OF',
    'SCHOOL BOARD', 'HOUSING AUTHORITY', 'WATER MANAGEMENT', 'UTILITY',
    'UTILITIES', 'CHURCH', 'DIOCESE', 'HOMEOWNERS', 'ASSOCIATION',
    'REIT', 'CAPITAL', 'EQUITY', 'FUND', 'HOLDINGS', 'MANAGEMENT',
    'PARTNERS LP', 'INVESTMENTS INC', 'DEVELOPMENT CORP', 'HOMES LLC',
    'BUILDERS', 'CONSTRUCTION', 'DR HORTON', 'D R HORTON', 'LENNAR',
    'PULTE', 'KB HOME', 'MERITAGE', 'RYAN HOMES', 'NVR',
  ];
  for (const kw of institutionalKeywords) {
    if (n.includes(kw)) return 'institutional';
  }

  if (n.endsWith(' LLC') || n.includes(' LLC,') || /\bLLC\b/.test(n)) return 'llc';
  if (n.endsWith(' LP') || /\bLP\b/.test(n)) return 'llc';
  if (n.includes('TRUST') && !n.includes('REAL ESTATE TRUST')) return 'individual';
  if (/^[A-Z\- .']+,\s*[A-Z\- .']+$/.test(n)) return 'individual'; // "LAST, FIRST"

  return 'unknown';
}

// ---------- small parse utils (same shape as denverFollowup.ts) ----------

export function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Epoch-millis (ArcGIS date field) → ISO yyyy-mm-dd.
export function epochToIso(v: unknown): string | undefined {
  const t = num(v);
  if (!t || t <= 0) return undefined;
  return new Date(t).toISOString().slice(0, 10);
}

// ArcGIS polygon → centroid [lng, lat] (verbatim from denverFollowup.ts).
export function extractPolygonRings(geometry: unknown): number[][][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geometry as any;
  if (g?.rings) return g.rings;
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) return g.coordinates;
  if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return (g.coordinates as number[][][][]).flat();
  }
  return [];
}

export function centroidFromGeometry(geometry: unknown, fallback: [number, number]): [number, number] {
  const rings = extractPolygonRings(geometry);
  const coords: number[][] = [];
  const collect = (arr: unknown[]): void => {
    if (typeof arr[0] === 'number') {
      coords.push(arr as number[]);
    } else {
      for (const sub of arr) collect(sub as unknown[]);
    }
  };
  collect(rings as unknown[]);
  if (coords.length === 0) return fallback;
  const sx = coords.reduce((s, c) => s + c[0], 0);
  const sy = coords.reduce((s, c) => s + c[1], 0);
  return [sx / coords.length, sy / coords.length];
}

export const SQFT_PER_ACRE = 43560;
