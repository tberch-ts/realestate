import type { CensusRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const ACS_URL = (year: number) => `https://api.census.gov/data/${year}/acs/acs5`;

// Variable IDs:
// B19013_001E = median household income
// B01003_001E = total population
// B25064_001E = median gross rent
// B25070_010E = rent burdened (50%+ of income on rent) count
const VARS = ['B19013_001E', 'B01003_001E', 'B25064_001E', 'B25070_010E'];

// Years to query for growth calc (latest available ACS 5-year vs. a 5-year earlier vintage).
const LATEST_YEAR = 2022;
const PRIOR_YEAR = 2017;

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
          Counties?: Array<{ STATE: string; COUNTY: string; NAME: string; GEOID: string }>;
          States?: Array<{ STUSAB: string; NAME: string }>;
        };
      };
    };
    const tract = geoBody.result?.geographies?.['Census Tracts']?.[0];
    const county = geoBody.result?.geographies?.Counties?.[0];
    if (!tract || !county) {
      return { provider, status: 'not_available', message: 'No tract/county resolved' };
    }

    // Tract-level (neighborhood) stats: latest vintage only
    const tractRow = await fetchAcsRow({
      year: LATEST_YEAR,
      vars: VARS,
      scope: `tract:${tract.TRACT}`,
      in: `state:${tract.STATE} county:${tract.COUNTY}`,
    });

    // County-level population: latest + prior for growth calc
    const [countyLatest, countyPrior] = await Promise.all([
      fetchAcsRow({
        year: LATEST_YEAR,
        vars: ['B01003_001E'],
        scope: `county:${county.COUNTY}`,
        in: `state:${county.STATE}`,
      }),
      fetchAcsRow({
        year: PRIOR_YEAR,
        vars: ['B01003_001E'],
        scope: `county:${county.COUNTY}`,
        in: `state:${county.STATE}`,
      }),
    ]);

    const [income, pop, rent, burdened] = (tractRow ?? []).map((v) =>
      v == null ? undefined : Number(v)
    );
    const popCounty = countyLatest ? Number(countyLatest[0]) : undefined;
    const popCountyPrior = countyPrior ? Number(countyPrior[0]) : undefined;
    const growthPct =
      popCounty && popCountyPrior && popCountyPrior > 0
        ? Number((((popCounty - popCountyPrior) / popCountyPrior) * 100).toFixed(2))
        : undefined;

    return {
      provider,
      status: 'ok',
      data: {
        tract: tract.GEOID,
        countyName: county.NAME,
        stateCode: geocode.stateCode,
        medianHouseholdIncome: finite(income),
        population: finite(pop),
        populationCounty: finite(popCounty),
        populationGrowthPct5yr: finite(growthPct),
        medianGrossRent: finite(rent),
        rentBurdenedPct: finite(burdened),
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

async function fetchAcsRow(args: {
  year: number;
  vars: string[];
  scope: string;
  in: string;
}): Promise<string[] | null> {
  const url = new URL(ACS_URL(args.year));
  url.searchParams.set('get', args.vars.join(','));
  url.searchParams.set('for', args.scope);
  url.searchParams.set('in', args.in);
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as string[][];
  if (!body || body.length < 2) return null;
  // First row of data (index 1), slice to just the variable values
  return body[1].slice(0, args.vars.length);
}

function finite(n: number | undefined): number | undefined {
  return Number.isFinite(n) ? n : undefined;
}
