import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Denver Open Data: real_property dataset.
// Reference: https://opendata-geospatialdenver.hub.arcgis.com/
// This is a first-pass implementation that queries the ArcGIS REST endpoint by address.
// If the service shape changes we return status: 'not_available' and surface the reason.

const DENVER_REAL_PROPERTY =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/ODC_REAL_PROPERTY_RESIDENTIAL_P/FeatureServer/0/query';

export async function fetchDenverAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'denver_assessor';
  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();

    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(DENVER_REAL_PROPERTY);
    url.searchParams.set('where', `SITUS_ADDRESS LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) return { provider, status: 'error', message: `HTTP ${res.status}` };

    const body = (await res.json()) as {
      features?: Array<{ attributes: Record<string, unknown> }>;
      error?: { message: string };
    };

    if (body.error) return { provider, status: 'error', message: body.error.message };
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Denver parcel matched this address' };
    }

    const a = body.features[0].attributes;
    const record: AssessorRecord = {
      parcelId: str(a.SCHEDNUM) ?? str(a.PARCEL_ID),
      owner: str(a.OWNER_NAME),
      assessedValue: num(a.TOTAL_VALUE ?? a.ASSESSED_VALUE),
      yearBuilt: num(a.YEAR_BUILT),
      units: num(a.UNITS ?? a.NUM_UNITS),
      sqft: num(a.BLDG_SQFT ?? a.BUILDING_SQFT),
      lotSqft: num(a.LAND_SQFT),
      propertyClass: str(a.PROPERTY_CLASS ?? a.D_CLASSCN),
      lastSalePrice: num(a.SALE_PRICE),
      lastSaleDate: str(a.SALE_DATE),
    };

    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v);
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
