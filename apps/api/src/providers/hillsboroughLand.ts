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

// Hillsborough County (Tampa, FL) parcels. The county property appraiser's
// own host (maps.hcpafl.org) is dead — see markets.ts — but the City of
// Tampa ArcGIS server republishes the FULL county tax roll (city + county
// parcels, per the layer description). Verified live 2026-07-22: DOR_C
// (FL DOR use code) flags vacant parcels, S_DATE/AMT give sale date/price,
// OWNER + ADDR_1/CITY/STATE/ZIP give the owner mailing address, ACREAGE +
// LEGAL1-4 round out the lead. The FGIO statewide cadastral layer was
// evaluated and rejected: attribute queries on unindexed fields (CO_NO,
// PHY_CITY, zips) 400 or full-scan for minutes. See
// project-docs/data-sources-by-msa.md.
const HILLSBOROUGH_PARCELS_URL =
  'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query';

// Florida DOR land-use codes for vacant land (4-char, zero-padded in this
// layer). 00xx = vacant residential; 10xx vacant commercial; 40xx vacant
// industrial. Verified '0000' live; the others are standard DOR codes kept
// configurable here.
export const HILLSBOROUGH_VACANT_DOR_CODES: Record<string, string> = {
  '0000': 'vacant_residential',
  '1000': 'vacant_commercial',
  '4000': 'vacant_industrial',
};

// Hillsborough zips start with 335/336 — out-of-county-owner heuristic.
const HILLSBOROUGH_ZIP_PREFIXES = ['335', '336'];

const OUT_FIELDS = [
  'FOLIO', 'PIN', 'OWNER', 'ADDR_1', 'CITY', 'STATE', 'ZIP',
  'SITE_ADDR', 'SITE_CITY', 'SITE_ZIP', 'DOR_C', 'ACREAGE',
  'LAND', 'ASD_VAL', 'S_DATE', 'AMT', 'LEGAL1',
].join(',');

const cache = new Map<string, { data: LandLeadResult; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchHillsboroughLandLeads(
  filters: LandLeadFilters
): Promise<ProviderResult<LandLeadResult>> {
  const provider = 'hillsborough_land';
  const f = normalizeFilters(filters);
  const cacheKey = filtersCacheKey('tampa', f);

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: hit.data, fetchedAt: new Date(hit.ts).toISOString() };
  }

  try {
    const codes = resolveCodes(f);
    if (codes.length === 0) {
      return { provider, status: 'ok', data: { market: 'tampa', count: 0, filters: f, leads: [] } };
    }

    const where: string[] = [
      `DOR_C IN (${codes.map((c) => `'${c}'`).join(',')})`,
    ];
    if (f.minAcres != null) where.push(`ACREAGE >= ${f.minAcres}`);
    if (f.maxAcres != null) where.push(`ACREAGE <= ${f.maxAcres}`);
    if (f.zips?.length) {
      const zips = f.zips.map((z) => `'${z.replace(/[^0-9]/g, '').slice(0, 5)}'`);
      where.push(`SITE_ZIP IN (${zips.join(',')})`);
    }
    if (f.city) where.push(`UPPER(SITE_CITY) = '${f.city.toUpperCase().replace(/'/g, "''")}'`);
    const cutoff = holdCutoffIso(f.minYearsHeld);
    where.push(`(S_DATE IS NULL OR S_DATE <= TIMESTAMP '${cutoff} 00:00:00')`);

    const params = new URLSearchParams({
      where: where.join(' AND '),
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '5',
      resultRecordCount: '2000',
      f: 'json',
    });

    const res = await fetch(HILLSBOROUGH_PARCELS_URL, {
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

    const filtered = applyOwnershipFilters(parcels, f, 'FL');
    const leads = filtered
      .map((p) => scoreLandLead(p, 'FL'))
      .sort((a, b) => b.score - a.score);

    const data: LandLeadResult = {
      market: 'tampa',
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

function resolveCodes(f: LandLeadFilters): string[] {
  let entries = Object.entries(HILLSBOROUGH_VACANT_DOR_CODES);
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

  const mailingZip = str(a.ZIP)?.slice(0, 5);
  const outOfCountyOwner = mailingZip
    ? !HILLSBOROUGH_ZIP_PREFIXES.some((p) => mailingZip.startsWith(p))
    : undefined;

  const dorCode = str(a.DOR_C);
  const acres = num(a.ACREAGE);
  // AMT of 0 means "no qualified sale price" — treat as absent.
  const salePrice = num(a.AMT);

  const ownerMailingAddress = [
    str(a.ADDR_1),
    [str(a.CITY), str(a.STATE), str(a.ZIP)].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    parcelId: str(a.FOLIO) ?? str(a.PIN),
    address: str(a.SITE_ADDR),
    zip: str(a.SITE_ZIP)?.slice(0, 5),
    city: str(a.SITE_CITY),
    owner,
    ownerMailingAddress: ownerMailingAddress || undefined,
    ownerMailingState: str(a.STATE)?.toUpperCase().slice(0, 2),
    outOfCountyOwner,
    lotAcres: acres,
    lotSqft: acres != null ? Math.round(acres * 43560) : undefined,
    landUseCode: dorCode,
    landUseLabel: dorCode ? HILLSBOROUGH_VACANT_DOR_CODES[dorCode] : undefined,
    salePrice: salePrice && salePrice > 0 ? salePrice : undefined,
    saleDate: epochToIso(a.S_DATE),
    assessedValue: num(a.ASD_VAL) ?? num(a.LAND),
    centroid: centroidFromGeometry(geometry, [-82.4572, 27.9506]),
  };
}
