import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Maricopa County Assessor — free hosted ArcGIS FeatureServer view
// ("ASR_Parcels") published by Maricopa County GIS. No API key required;
// default ArcGIS hosted-service quota.
//
// VERIFIED LIVE 2026-07-13: hit `${PHOENIX_PARCELS}?f=json` (drop the
// trailing `/query`) and confirmed real layer metadata + a real address
// query (`8130 W INDIAN SCHOOL RD` in Phoenix) returned a genuine parcel —
// owner "MCP TIDES ON WEST INDIAN SCHOOL OWNER LLC", a 100+ unit apartment
// complex, sale price $37,860,000, sale date 2021-03-01, full cash value
// $30,492,500. Not a guess — this is the confirmed live schema.
//
// The previous URL (`services6.arcgis.com/btCzjPTmhHGPvKkG/.../Parcels/
// FeatureServer/0`) is dead — that org id no longer resolves (ArcGIS
// returns `{"error":{"code":400,"message":"Invalid URL"}}` even with the
// correct lowercase `arcgis` path segment). This replacement was found via
// the ArcGIS Online Sharing REST API (`sharing/rest/search` scoped to
// Maricopa's `ykpntM6e3tHvzKRJ` org) and belongs to the item titled
// "Parcel Data" (owner `MaricopaCountyGIS`, item id
// `4c0a493411514600a6f7ffdc67d41e82`), which is a hosted *view* over the
// Assessor's real parcel table (displayField `PropertyStreetName`).
//
// If this slug ever moves again, re-run the sharing/rest/search query
// above and swap PHOENIX_PARCELS — no other code needs to move.
const PHOENIX_PARCELS =
  'https://services.arcgis.com/ykpntM6e3tHvzKRJ/arcgis/rest/services/Parcel_Data_View/FeatureServer/0/query';

// Field names below are the CONFIRMED live schema (pulled from
// `.../FeatureServer/0?f=json` and cross-checked against a real query
// result), not a guess. No per-parcel unit-count field exists on this
// layer — `PropertyUseDescription` only carries bucketed ranges like
// "APARTMENTS 25 - 99 UNITS 2 STORY", so `units` is left undefined rather
// than parsed out of a range.
interface MaricopaParcelAttrs {
  APN?: string;                    // e.g. "10220004H" (Book-Map-Item[-Split])
  OwnerName?: string;
  OwnerAddressLine1?: string;
  OwnerCity?: string;
  OwnerState?: string;
  OwnerZipCode?: string;
  PropertyFullStreetAddress?: string; // Pre-joined situs address string
  PropertyCity?: string;
  PropertyZipCode?: string;
  ConstructionYear?: number;
  // Livable area is populated for single-family/small residential parcels
  // and is frequently null for large multifamily/commercial parcels (the
  // roll tracks those by improvement value instead) — confirmed on the
  // live 100+ unit apartment record used to verify this schema.
  LivableArea_SqFt?: number;
  LotSize_SqFt?: number;
  LotSize_Acre?: number;           // Fallback when LotSize_SqFt is null
  PropertyUseCode?: string;
  PropertyUseDescription?: string;
  // FullCashValue = uncapped market value per the roll; AssessedFullCashValue
  // is FullCashValue run through the class assessment ratio. We prefer the
  // market figure, same "prefer market over capped" pattern as Tampa's
  // JV/AV choice.
  FullCashValue?: number;
  AssessedFullCashValue?: number;
  SalePrice?: number;
  SaleDate?: number;               // epoch ms
}

interface FeatureServerResponse {
  features?: Array<{ attributes: MaricopaParcelAttrs }>;
  error?: { message: string };
}

export async function fetchPhoenixAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'phoenix_assessor';
  if (geocode.stateCode !== 'AZ') {
    return {
      provider,
      status: 'not_available',
      message: 'Maricopa County Assessor only covers addresses in AZ',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(PHOENIX_PARCELS);
    // PropertyFullStreetAddress is the layer's composed situs address
    // string (e.g. "8130 W INDIAN SCHOOL RD"). Prefix LIKE so a suite/unit
    // suffix on the input address still matches the base parcel row.
    const where = `PropertyFullStreetAddress LIKE '${addr.replace(/'/g, "''")}%'`;
    url.searchParams.set('where', where);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Maricopa ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Maricopa parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: MaricopaParcelAttrs): AssessorRecord {
  // Land area: layer publishes both LotSize_SqFt and LotSize_Acre; prefer
  // the pre-computed sqft figure and only convert from acres if it's null.
  let lotSqft = num(a.LotSize_SqFt);
  if (lotSqft == null) {
    const acres = num(a.LotSize_Acre);
    if (acres != null) lotSqft = Math.round(acres * 43560);
  }

  // SalePrice = null/0 means no recorded arms-length transfer on this
  // parcel — filter those out same as Denver's $0 sentinel handling.
  const salePrice = num(a.SalePrice);
  const saleDate = a.SaleDate ? new Date(a.SaleDate).toISOString().slice(0, 10) : undefined;

  return {
    parcelId: str(a.APN),
    owner: str(a.OwnerName),
    assessedValue: num(a.FullCashValue) ?? num(a.AssessedFullCashValue),
    yearBuilt: num(a.ConstructionYear),
    // No reliable per-parcel unit count on this layer — PropertyUseDescription
    // only carries bucketed ranges ("APARTMENTS 25 - 99 UNITS"), not a count.
    units: undefined,
    sqft: num(a.LivableArea_SqFt),
    lotSqft,
    propertyClass: str(a.PropertyUseDescription) ?? str(a.PropertyUseCode),
    lastSalePrice: salePrice && salePrice > 0 ? salePrice : undefined,
    lastSaleDate: saleDate,
    source: 'maricopa',
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
