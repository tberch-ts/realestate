import type { LandLeadFilters, LandLeadResult, LandParcel, ProviderResult } from '@mfa/shared';
import {
  applyOwnershipFilters,
  centroidFromGeometry,
  epochToIso,
  filtersCacheKey,
  normalizeFilters,
  num,
  scoreLandLead,
  str,
} from './landCommon.js';

// Wake County (Raleigh, NC) parcels — Wake County GIS ArcGIS FeatureServer.
// Verified live 2026-07-22: LAND_CLASS/'VAC' distinguishes vacant parcels;
// OWNER + ADDR1-3 give the owner's mailing address; DEED_DATE (epoch ms)
// covers hold time even when SALE_DATE is null; DEED_ACRES + ZIPNUM +
// SITE_ADDRESS round out the lead. See project-docs/data-sources-by-msa.md.
const WAKE_PARCELS_URL =
  'https://maps.wake.gov/arcgis/rest/services/Property/Parcels/FeatureServer/0/query';

// Assessor land classes that mean "no structure on it". VAC is the explicit
// vacant class; AWI is "Acre With Improvement, No House" (sheds/wells but no
// dwelling) — close enough to a buildable lot that builders want to see it.
export const WAKE_VACANT_CLASSES: Record<string, string> = {
  VAC: 'vacant',
  AWI: 'vacant_with_improvement',
};

// Wake County zip codes start with these prefixes — used for the
// out-of-county-owner heuristic (mailing zip outside the county).
const WAKE_ZIP_PREFIXES = ['275', '276'];

const OUT_FIELDS = [
  'PIN_NUM', 'OWNER', 'ADDR1', 'ADDR2', 'ADDR3', 'SITE_ADDRESS', 'CITY_DECODE',
  'ZIPNUM', 'DEED_ACRES', 'DEED_DATE', 'SALE_DATE', 'TOTSALPRICE',
  'LAND_CLASS', 'LAND_CLASS_DECODE', 'LAND_VAL', 'TOTAL_VALUE_ASSD',
].join(',');

const cache = new Map<string, { data: LandLeadResult; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h — same as denverFollowup.ts

export async function fetchWakeLandLeads(
  filters: LandLeadFilters
): Promise<ProviderResult<LandLeadResult>> {
  const provider = 'wake_land';
  const f = normalizeFilters(filters);
  const cacheKey = filtersCacheKey('raleigh', f);

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: hit.data, fetchedAt: new Date(hit.ts).toISOString() };
  }

  try {
    const classes = resolveClasses(f);
    if (classes.length === 0) {
      return { provider, status: 'ok', data: { market: 'raleigh', count: 0, filters: f, leads: [] } };
    }

    const where: string[] = [
      `LAND_CLASS IN (${classes.map((c) => `'${c}'`).join(',')})`,
    ];
    if (f.minAcres != null) where.push(`DEED_ACRES >= ${f.minAcres}`);
    if (f.maxAcres != null) where.push(`DEED_ACRES <= ${f.maxAcres}`);
    if (f.zips?.length) {
      const zips = f.zips.map((z) => `'${z.replace(/[^0-9]/g, '').slice(0, 5)}'`);
      where.push(`ZIPNUM IN (${zips.join(',')})`);
    }
    if (f.city) where.push(`UPPER(CITY_DECODE) = '${f.city.toUpperCase().replace(/'/g, "''")}'`);
    // Server-side hold-time pre-filter (authoritative filter runs post-fetch
    // in applyOwnershipFilters, where SALE_DATE falls back to DEED_DATE).
    const cutoff = holdCutoffIso(f.minYearsHeld);
    where.push(`(SALE_DATE IS NULL OR SALE_DATE <= TIMESTAMP '${cutoff} 00:00:00')`);

    const params = new URLSearchParams({
      where: where.join(' AND '),
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '5',
      resultRecordCount: '2000',
      f: 'json',
    });

    const res = await fetch(WAKE_PARCELS_URL, {
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

    const parcels = (body.features ?? [])
      .map((feat) => toParcel(feat.attributes, feat.geometry))
      .filter((p): p is LandParcel => p !== null);

    const filtered = applyOwnershipFilters(parcels, f, 'NC');
    const leads = filtered
      .map((p) => scoreLandLead(p, 'NC'))
      .sort((a, b) => b.score - a.score);

    const data: LandLeadResult = {
      market: 'raleigh',
      count: leads.length,
      filters: f,
      leads: leads.slice(0, f.limit),
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return { provider, status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function resolveClasses(f: LandLeadFilters): string[] {
  let entries = Object.entries(WAKE_VACANT_CLASSES);
  if (f.landUseIn?.length) entries = entries.filter(([, label]) => f.landUseIn!.includes(label));
  if (f.landUseNotIn?.length) entries = entries.filter(([, label]) => !f.landUseNotIn!.includes(label));
  return entries.map(([code]) => code);
}

function holdCutoffIso(minYearsHeld: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minYearsHeld);
  return d.toISOString().slice(0, 10);
}

function toParcel(a: Record<string, unknown>, geometry: unknown): LandParcel | null {
  const owner = str(a.OWNER);
  if (!owner) return null;

  // Mailing address lines: ADDR1 = street, ADDR2/ADDR3 = "CITY ST ZIP".
  const mailingLine = str(a.ADDR3) ?? str(a.ADDR2);
  const mailing = mailingLine ? /\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/.exec(mailingLine.toUpperCase()) : null;
  const ownerMailingState = mailing?.[1];
  const ownerMailingZip = mailing?.[2];
  // Heuristic: mailing zip outside Wake's prefixes = out-of-county owner.
  const outOfCountyOwner = ownerMailingZip
    ? !WAKE_ZIP_PREFIXES.some((p) => ownerMailingZip.startsWith(p))
    : undefined;

  const landClass = str(a.LAND_CLASS);
  const acres = num(a.DEED_ACRES);

  const ownerMailingAddress = [str(a.ADDR1), str(a.ADDR2), str(a.ADDR3)].filter(Boolean).join(', ');

  return {
    parcelId: str(a.PIN_NUM),
    address: str(a.SITE_ADDRESS),
    zip: str(a.ZIPNUM),
    city: str(a.CITY_DECODE),
    owner,
    ownerMailingAddress: ownerMailingAddress || undefined,
    ownerMailingState,
    outOfCountyOwner,
    lotAcres: acres,
    lotSqft: acres != null ? Math.round(acres * 43560) : undefined,
    landUseCode: landClass,
    landUseLabel: landClass ? WAKE_VACANT_CLASSES[landClass] ?? str(a.LAND_CLASS_DECODE)?.toLowerCase() : undefined,
    salePrice: num(a.TOTSALPRICE),
    // DEED_DATE fallback: many long-held parcels have no recorded market
    // sale but do carry the deed transfer date.
    saleDate: epochToIso(a.SALE_DATE) ?? epochToIso(a.DEED_DATE),
    assessedValue: num(a.TOTAL_VALUE_ASSD) ?? num(a.LAND_VAL),
    centroid: centroidFromGeometry(geometry, [-78.6382, 35.7796]),
  };
}
