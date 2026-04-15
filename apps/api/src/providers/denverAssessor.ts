import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Denver Open Data real property datasets. For 100+ unit multifamily we really want the
// commercial dataset, but residential covers small multifamily. Try commercial first;
// fall back to residential.
const DENVER_COMMERCIAL =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/ODC_REAL_PROPERTY_COMMERCIAL_P/FeatureServer/0/query';
const DENVER_RESIDENTIAL =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/ODC_REAL_PROPERTY_RESIDENTIAL_P/FeatureServer/0/query';

export async function fetchDenverAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'denver_assessor';
  const stateCode = geocode.stateCode;
  if (stateCode !== 'CO') {
    return {
      provider,
      status: 'not_available',
      message: 'Denver Assessor only covers Denver County, CO',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const tryOne = async (endpoint: string, source: AssessorRecord['source']) => {
      const url = new URL(endpoint);
      url.searchParams.set('where', `SITUS_ADDRESS LIKE '${addr.replace(/'/g, "''")}%'`);
      url.searchParams.set('outFields', '*');
      url.searchParams.set('f', 'json');
      url.searchParams.set('resultRecordCount', '1');

      const res = await fetch(url);
      if (!res.ok) return null;
      const body = (await res.json()) as {
        features?: Array<{ attributes: Record<string, unknown> }>;
        error?: { message: string };
      };
      if (body.error || !body.features || body.features.length === 0) return null;
      return toRecord(body.features[0].attributes, source);
    };

    const commercial = await tryOne(DENVER_COMMERCIAL, 'denver_commercial');
    if (commercial) {
      return { provider, status: 'ok', data: commercial, fetchedAt: new Date().toISOString() };
    }
    const residential = await tryOne(DENVER_RESIDENTIAL, 'denver_residential');
    if (residential) {
      return { provider, status: 'ok', data: residential, fetchedAt: new Date().toISOString() };
    }

    return { provider, status: 'not_available', message: 'No Denver parcel matched this address' };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: Record<string, unknown>, source: AssessorRecord['source']): AssessorRecord {
  return {
    parcelId: str(a.SCHEDNUM) ?? str(a.PARCEL_ID),
    owner: str(a.OWNER_NAME),
    assessedValue: num(a.TOTAL_VALUE ?? a.ASSESSED_VALUE),
    yearBuilt: num(a.YEAR_BUILT ?? a.CCYRBLT),
    units: num(a.UNITS ?? a.NUM_UNITS ?? a.UNIT_COUNT),
    sqft: num(a.BLDG_SQFT ?? a.BUILDING_SQFT ?? a.TOTAL_SQFT),
    lotSqft: num(a.LAND_SQFT ?? a.LOT_SIZE),
    propertyClass: str(a.PROPERTY_CLASS ?? a.D_CLASSCN ?? a.USE_DESC),
    lastSalePrice: num(a.SALE_PRICE),
    lastSaleDate: str(a.SALE_DATE),
    source,
  };
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
