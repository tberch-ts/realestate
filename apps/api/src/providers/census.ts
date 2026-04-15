import type { CensusRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// US Census ACS 5-year via Census Geocoder + ACS API. Both are free & keyless (rate-limited).
// Geocode lat/lng → FIPS tract → ACS variables.

const GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const ACS = 'https://api.census.gov/data/2022/acs/acs5';

// Variable IDs: median HH income, total population, median gross rent, rent-burdened %
const VARS = ['B19013_001E', 'B01003_001E', 'B25064_001E', 'B25070_010E'];

export async function fetchCensus(geocode: GeocodedAddress): Promise<ProviderResult<CensusRecord>> {
  const provider = 'census_acs';
  try {
    const geoUrl = new URL(GEOCODER);
    geoUrl.searchParams.set('x', String(geocode.lng));
    geoUrl.searchParams.set('y', String(geocode.lat));
    geoUrl.searchParams.set('benchmark', 'Public_AR_Current');
    geoUrl.searchParams.set('vintage', 'Current_Current');
    geoUrl.searchParams.set('format', 'json');

    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return { provider, status: 'error', message: `Geocoder HTTP ${geoRes.status}` };
    const geoBody = (await geoRes.json()) as {
      result?: {
        geographies?: {
          'Census Tracts'?: Array<{ STATE: string; COUNTY: string; TRACT: string; GEOID: string }>;
        };
      };
    };
    const tract = geoBody.result?.geographies?.['Census Tracts']?.[0];
    if (!tract) {
      return { provider, status: 'not_available', message: 'No census tract resolved for coordinates' };
    }

    const acsUrl = new URL(ACS);
    acsUrl.searchParams.set('get', VARS.join(','));
    acsUrl.searchParams.set('for', `tract:${tract.TRACT}`);
    acsUrl.searchParams.set('in', `state:${tract.STATE} county:${tract.COUNTY}`);

    const acsRes = await fetch(acsUrl);
    if (!acsRes.ok) return { provider, status: 'error', message: `ACS HTTP ${acsRes.status}` };
    const acsBody = (await acsRes.json()) as string[][];
    if (!acsBody || acsBody.length < 2) {
      return { provider, status: 'not_available', message: 'Empty ACS response' };
    }
    const [, row] = acsBody;
    const [income, pop, rent, burdened] = row.map((v) => (v == null ? undefined : Number(v)));

    return {
      provider,
      status: 'ok',
      data: {
        tract: tract.GEOID,
        medianHouseholdIncome: finite(income),
        population: finite(pop),
        medianGrossRent: finite(rent),
        rentBurdenedPct: finite(burdened),
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function finite(n: number | undefined): number | undefined {
  return Number.isFinite(n) ? n : undefined;
}
