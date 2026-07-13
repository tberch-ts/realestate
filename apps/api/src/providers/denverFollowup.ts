import type { FollowupProperty, FollowupResult, FollowupScored, OwnerType, ProviderResult } from '@mfa/shared';
import { fetchHotspots } from './neighborhoods.js';

// Denver Open Data: Middle Housing Stock (ArcGIS FeatureServer).
// Contains parcels with unit counts, owner, year built, last sale.
// Supports spatial query (esriSpatialRelIntersects) against a polygon.
const MIDDLE_HOUSING_URL =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/Middle_Housing_Stock/FeatureServer/0/query';

// In-memory cache keyed by "zone:minUnits:minYear"
const cache = new Map<string, { data: FollowupResult; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchDenverFollowup(opts: {
  zone: string;
  minUnits?: number;
  minYear?: number;
  limit?: number;
}): Promise<ProviderResult<FollowupResult>> {
  const provider = 'denver_followup';
  const minUnits = opts.minUnits ?? 100;
  const minYear = opts.minYear ?? 1990;
  const limit = Math.min(opts.limit ?? 50, 200);
  const cacheKey = `${opts.zone.toLowerCase()}:${minUnits}:${minYear}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: slice(hit.data, limit), fetchedAt: new Date(hit.ts).toISOString() };
  }

  // 1. Find the zone polygon from the cached neighborhoods GeoJSON.
  const hs = await fetchHotspots('denver');
  if (hs.status !== 'ok' || !hs.data) {
    return { provider, status: 'error', message: 'Hotspots cache unavailable' };
  }
  const target = opts.zone.toLowerCase();
  const feature = hs.data.features.find((f) => {
    const name = String(f.properties.nbhd_name ?? '').toLowerCase();
    return name === target;
  });
  if (!feature) {
    return { provider, status: 'not_available', message: `Zone '${opts.zone}' not found` };
  }

  // 2. Spatial query against Middle_Housing_Stock.
  try {
    const rings = extractPolygonRings(feature.geometry);
    const geometry = JSON.stringify({ rings, spatialReference: { wkid: 4326 } });

    const where =
      `(EST_UNITS >= ${minUnits} OR TOT_UNITS >= ${minUnits}) ` +
      `AND (COALESCE(COM_ORIG_YEAR_BUILT, RES_ORIG_YEAR_BUILT) >= ${minYear} ` +
      `  OR RES_ORIG_YEAR_BUILT >= ${minYear} ` +
      `  OR COM_ORIG_YEAR_BUILT >= ${minYear})`;

    // ArcGIS polygon geometry JSON is too big for GET; POST instead.
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

    const res = await fetch(MIDDLE_HOUSING_URL, {
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

    const raw = body.features ?? [];
    const properties = raw
      .map((f) => toFollowupProperty(f.attributes, f.geometry))
      .filter((p): p is FollowupProperty => p !== null && (p.units ?? 0) >= minUnits);

    const scored = properties
      .map(scoreFollowup)
      .sort((a, b) => b.score - a.score);

    const full: FollowupResult = { zone: opts.zone, count: scored.length, candidates: scored };
    cache.set(cacheKey, { data: full, ts: Date.now() });

    return { provider, status: 'ok', data: slice(full, limit), fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function slice(r: FollowupResult, limit: number): FollowupResult {
  return { zone: r.zone, count: r.count, candidates: r.candidates.slice(0, limit) };
}

function toFollowupProperty(a: Record<string, unknown>, geometry: unknown): FollowupProperty | null {
  // SITUS_ADDRESS_LINE1 already includes the street number; the separate NBR
  // field is redundant. Prefer line1 alone; fall back to nbr+suf composition.
  const line1 = str(a.SITUS_ADDRESS_LINE1);
  const nbr = str(a.SITUS_ADDR_NBR);
  const suf = str(a.SITUS_ADDR_NBR_SUFFIX);
  const address = line1 ?? [nbr, suf].filter(Boolean).join(' ').trim();
  if (!address) return null;

  const units = num(a.EST_UNITS) ?? num(a.TOT_UNITS);
  const year = num(a.COM_ORIG_YEAR_BUILT) ?? num(a.RES_ORIG_YEAR_BUILT);
  const sqft = num(a.COM_GROSS_AREA) ?? num(a.COM_NET_AREA) ?? num(a.RES_ABOVE_GRADE_AREA);

  const saleYear = num(a.SALE_YEAR);
  const saleMd = str(a.SALE_MONTHDAY); // MMDD
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

function scoreFollowup(p: FollowupProperty): FollowupScored {
  const reasons: string[] = [];
  const now = new Date();

  // ---- Hold time ----
  let yearsHeld: number | undefined;
  if (p.saleDate) {
    const saleYear = Number(p.saleDate.slice(0, 4));
    if (Number.isFinite(saleYear) && saleYear > 1900) {
      yearsHeld = now.getFullYear() - saleYear;
    }
  }
  // 3yr = 0, 10yr = 100
  const holdScore =
    yearsHeld == null
      ? 50
      : Math.max(0, Math.min(100, (yearsHeld - 3) * 14.3));
  if (yearsHeld != null && yearsHeld >= 7) reasons.push(`Owner has held ${yearsHeld}y`);

  // ---- Owner type ----
  const ownerType = classifyOwner(p.owner);
  const ownerScore = ownerType === 'individual' ? 95 : ownerType === 'llc' ? 75 : ownerType === 'institutional' ? 20 : 50;
  if (ownerType === 'individual') reasons.push('Individual/trust owner');
  else if (ownerType === 'llc') reasons.push('Small LLC owner');
  else if (ownerType === 'institutional') reasons.push('Institutional owner');

  // ---- Out-of-state owner ----
  const outOfStateOwner = p.ownerMailingState ? p.ownerMailingState.toUpperCase() !== 'CO' : undefined;
  if (outOfStateOwner) reasons.push(`Out-of-state owner (${p.ownerMailingState})`);

  // ---- Recency (tiebreaker) ----
  const recency = yearsHeld == null ? 50 : Math.max(0, 100 - yearsHeld * 5);

  // Final composite: long-hold and owner type dominate.
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

// Classify the OWNER_NAME string into institutional / llc / individual / unknown.
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
  for (const kw of institutionalKeywords) {
    if (n.includes(kw)) return 'institutional';
  }

  // "TRUST" is tricky — family trusts are individual-ish.
  if (n.endsWith(' LLC') || n.includes(' LLC,') || /\bLLC\b/.test(n)) return 'llc';
  if (n.endsWith(' LP') || /\bLP\b/.test(n)) return 'llc'; // limited partnership, medium.
  if (n.includes('TRUST') && !n.includes('REAL ESTATE TRUST')) return 'individual';
  if (/^[A-Z\- .']+,\s*[A-Z\- .']+$/.test(n)) return 'individual'; // "LAST, FIRST"

  return 'unknown';
}

// ArcGIS polygon geometries come in rings (Array<Array<[lng,lat]>>). Extract.
function extractPolygonRings(geometry: unknown): number[][][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = geometry as any;
  if (g?.rings) return g.rings;
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) return g.coordinates;
  if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return (g.coordinates as number[][][][]).flat();
  }
  return [];
}

function centroidFromGeometry(geometry: unknown): [number, number] {
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
