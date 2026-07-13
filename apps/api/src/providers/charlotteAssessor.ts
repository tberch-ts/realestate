import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Mecklenburg County / Charlotte — free ArcGIS Server (self-hosted, not
// ArcGIS Online) published by Mecklenburg County GIS at meckgis.
// No API key.
//
// The previously hardcoded `Parcels_Landmarks/MapServer/1` service no
// longer exists (confirmed 404 "Service not found" against the live
// catalog on 2026-07-13) — it was likely renamed/retired at some point.
// The current catalog root (https://meckgis.mecklenburgcountync.gov/
// server/rest/services?f=json) lists the real CAMA-joined parcel layer
// as `TaxParcel_camadata` (MapServer + FeatureServer, layer id 0). It
// carries situs address, owner, sale, valuation, and building detail
// (year built, heated area, unit counts) all on one row. Verified live
// via curl: FeatureServer/0/query returns real attributes (not a
// gateway error) and the field names below.
//
// Note: this layer has one row per *building* on a parcel, not one row
// per parcel — a multi-building apartment parcel (e.g. PID 22323141,
// "ATKINS CIRCLE DR") returns multiple rows with different resunits/
// heatedarea per building. We take the first match like the other
// per-county providers do (best-effort single-row read), so unit/sqft
// totals for multi-building complexes may reflect only one building
// rather than the parcel total.
const CHARLOTTE_PARCELS =
  'https://meckgis.mecklenburgcountync.gov/server/rest/services/TaxParcel_camadata/FeatureServer/0/query';

interface MecklenburgParcelAttrs {
  pid?: string;                     // Parcel ID (assessor's primary key)
  parcelid?: string;                // Same value, alternate column
  address?: string;                 // Full situs address: "<num> <street> <city> <ST>"
  streetnumber?: string;
  streetname?: string;
  loccity?: string;
  ownrlstnme?: string;              // Owner1 last name (or full entity name for LLCs/trusts)
  ownrfrstnme?: string | null;      // Owner1 first name (null for entities)
  mailaddr1?: string;
  zipcode?: string;
  saleprice?: number;
  saledate?: number;                // epoch ms
  yearbuilt?: number;
  effyearblt?: number;
  heatedarea?: number;              // Heated/living area, sqft
  finarea?: number;                 // Finished area, sqft (fallback)
  totalarea?: number;               // Gross building area, sqft (fallback)
  gisacres?: number;
  legalacres?: number;
  totlandval?: number;
  totalbldgval?: number;
  totalvalue?: number;              // Total assessed value
  totmarkval?: number;              // Total market value (same as totalvalue in practice)
  landuse_description?: string;     // e.g. "MULTI FAMILY", "INDUSTRIAL"
  lusecode?: string;
  comunits?: number;                // Commercial unit count
  resunits?: number;                // Residential unit count
}

interface FeatureServerResponse {
  features?: Array<{ attributes: MecklenburgParcelAttrs }>;
  error?: { message: string };
}

export async function fetchCharlotteAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'charlotte_assessor';
  if (geocode.stateCode !== 'NC') {
    return {
      provider,
      status: 'not_available',
      message: 'Mecklenburg County Assessor only covers addresses in NC',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(CHARLOTTE_PARCELS);
    // `address` is the full situs string "<num> <street> <city> <ST>" —
    // a prefix LIKE on "<num> <street>" matches regardless of unit
    // number or city/state suffix. Verified live against the FeatureServer.
    url.searchParams.set('where', `address LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Mecklenburg ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Mecklenburg parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: MecklenburgParcelAttrs): AssessorRecord {
  // Sale date arrives as epoch ms; convert to ISO date string for the UI.
  const saleDate = a.saledate ? new Date(a.saledate).toISOString().slice(0, 10) : undefined;

  // Owner: combine first+last for individuals; entity names (LLC, trust,
  // etc.) land entirely in ownrlstnme with a null ownrfrstnme.
  const owner = a.ownrfrstnme
    ? [a.ownrfrstnme, a.ownrlstnme].filter(Boolean).join(' ').trim() || undefined
    : str(a.ownrlstnme);

  // Prefer heated area (living/finished space), fall back to finished
  // area then gross total area.
  const sqft = num(a.heatedarea) ?? num(a.finarea) ?? num(a.totalarea);

  // Residential unit count for multifamily; fall back to commercial
  // units for parcels classified commercial (0 for most single rows).
  const units = num(a.resunits) || num(a.comunits);

  // Lot size arrives only as acres; convert to sqft (1 acre = 43,560 sqft).
  const acres = num(a.legalacres) ?? num(a.gisacres);
  const lotSqft = acres != null ? Math.round(acres * 43560) : undefined;

  return {
    parcelId: str(a.pid) ?? str(a.parcelid),
    owner,
    assessedValue: num(a.totalvalue) ?? num(a.totmarkval),
    yearBuilt: num(a.yearbuilt),
    units,
    sqft,
    lotSqft,
    propertyClass: str(a.landuse_description) ?? str(a.lusecode),
    // saleprice = 0 is the assessor's "no recorded sale" sentinel.
    lastSalePrice: a.saleprice && a.saleprice > 0 ? a.saleprice : undefined,
    lastSaleDate: saleDate,
    source: 'mecklenburg_nc',
  };
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
