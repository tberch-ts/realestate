import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Metro Nashville / Davidson County — free ArcGIS MapServer published by
// Metro Nashville GIS ("MetroGIS") at maps.nashville.gov.
//
// The previously hardcoded path (`Cadastral/Parcels_SP/MapServer/0`) does
// not exist on this server — `<url>?f=json` returns a real ArcGIS 500
// "Service ... not found" (not a casing/token gateway issue like Denver's
// bug). Walking the service catalog (`/arcgis/rest/services?f=json` ->
// `Cadastral` folder -> `?f=json`) shows the real, live services are:
//   - Cadastral/Parcels           (id 0 = "Ownership Parcels")  <- this one
//   - Cadastral/Cadastral_Layers  (id 4 = "Ownership Parcels", plus
//     Dimensions/Subdivision/Lot Polygon/House Numbers)
// Both expose the same "Ownership Parcels" feature layer; we use the
// dedicated Cadastral/Parcels service since it's the documented parcel
// boundary + ownership/valuation dataset. Verified live 2026-07-13 via
// curl: `.../Cadastral/Parcels/MapServer/0?f=json` returns real layer
// metadata, and a query with `where=PropAddr LIKE '222 %'` returns real
// matching parcels (owner, assessed value, land use, sale price/date).
//
// IMPORTANT: unlike Denver's assessor dataset, this Davidson County
// cadastral layer does NOT carry building characteristics — there is no
// year-built, unit-count, or building-square-footage column. It's a
// parcel/ownership/valuation layer, not a full CAMA record. yearBuilt,
// units, and sqft are intentionally left undefined below; lotSqft is
// derived from the `Acres` field (converted to square feet) since that's
// the only area field present.
const NASHVILLE_PARCELS =
  'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query';

const ACRES_TO_SQFT = 43560;

// Field names confirmed live against the layer's `?f=json` metadata and a
// sample query (`where=1=1`, `where=PropAddr LIKE '...'`).
interface DavidsonParcelAttrs {
  APN?: string;                   // Parcel ID, e.g. "09306201200"
  Owner?: string;
  OwnAddr1?: string;
  OwnAddr2?: string;
  OwnAddr3?: string;
  OwnCity?: string;
  OwnState?: string;
  OwnZip?: string;
  PropAddr?: string;              // Full situs address, e.g. "316 BROADWAY"
  PropHouse?: string;
  PropStreet?: string;
  PropCity?: string;
  PropState?: string;
  PropZip?: string;
  LUCode?: string;                // Land-use code, e.g. "038"
  LUDesc?: string;                // Land-use description, e.g.
                                   // "APARTMENT: LOW RISE (BUILT SINCE 1960)"
  // Value fields — Appr = appraised (market), Assd = assessed (taxable).
  LandAppr?: number;
  ImprAppr?: number;
  TotlAppr?: number;
  LandAssd?: number;
  ImprAssd?: number;
  TotlAssd?: number;
  // Area — no building sqft column exists on this layer; Acres/
  // StatedArea/DeededAcreage are all land area in acres.
  Acres?: number;
  StatedArea?: number;
  DeededAcreage?: number;
  SalePrice?: number;
  // OwnDate is the deed/transfer date backing Owner + SalePrice
  // (epoch ms, matches SaleCode/OwnInstr deed reference fields).
  OwnDate?: number;
}

interface FeatureServerResponse {
  features?: Array<{ attributes: DavidsonParcelAttrs }>;
  error?: { message: string };
}

export async function fetchNashvilleAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'nashville_assessor';
  if (geocode.stateCode !== 'TN') {
    return {
      provider,
      status: 'not_available',
      message: 'Davidson County Assessor only covers addresses in TN',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(NASHVILLE_PARCELS);
    // PropAddr holds the full situs address (e.g. "316 BROADWAY"); a
    // prefix LIKE matches regardless of trailing unit/suite text. Note
    // PropStreet alone sometimes carries a leading space in this dataset,
    // so PropAddr is the more reliable match target.
    url.searchParams.set('where', `PropAddr LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Nashville ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Davidson County parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: DavidsonParcelAttrs): AssessorRecord {
  const saleDate = a.OwnDate ? new Date(a.OwnDate).toISOString().slice(0, 10) : undefined;

  const acres = num(a.Acres) ?? num(a.DeededAcreage) ?? num(a.StatedArea);

  return {
    parcelId: str(a.APN),
    owner: str(a.Owner),
    assessedValue: num(a.TotlAssd) || num(a.TotlAppr),
    // Not published on this layer — Davidson's cadastral/GIS parcel
    // dataset has no building-characteristics columns (see file header).
    yearBuilt: undefined,
    units: undefined,
    sqft: undefined,
    lotSqft: acres !== undefined ? Math.round(acres * ACRES_TO_SQFT) : undefined,
    propertyClass: str(a.LUDesc) ?? str(a.LUCode),
    // SalePrice = 0 or null is the "no recorded sale" sentinel here too.
    lastSalePrice: a.SalePrice && a.SalePrice > 0 ? a.SalePrice : undefined,
    lastSaleDate: saleDate,
    source: 'davidson_tn',
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
