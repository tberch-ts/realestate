import type { MarketConfig, MarketKey } from '@mfa/shared';

// Single source of truth for every MSA we support. Every dispatcher
// (assessor, SoS, neighborhoods, followup, portfolio) routes off this
// list. Adding a new market = one entry here + matching provider file.
//
// `*Supported` flags honestly reflect today's fidelity. We flip them to
// true as we ship each slice; the frontend gates disabled menus off them.
//
// countyFips is the 5-digit state+county FIPS (e.g. 04013 = Maricopa AZ)
// and is how the assessorDispatcher routes a geocoded address to the
// right per-MSA provider without string-matching county names.
export const MARKETS: ReadonlyArray<MarketConfig> = [
  {
    key: 'denver',
    label: 'Denver, CO',
    stateCode: 'CO',
    countyFips: '08031',
    countyName: 'Denver',
    center: [-104.9903, 39.7392],
    assessorSupported: true,
    sosSupported: true,
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: true,
  },
  {
    key: 'phoenix',
    label: 'Phoenix, AZ',
    stateCode: 'AZ',
    countyFips: '04013',
    countyName: 'Maricopa',
    center: [-112.074, 33.4484],
    assessorSupported: true,
    // AZ business entities live at the Arizona Corporation Commission, not
    // the SoS — wrapped in a separate provider (arizonaSos.ts). Stub today.
    sosSupported: false,
    // Hotspots choropleth is live: 15 Urban Villages (City of Phoenix Open
    // Data ArcGIS) + national Census ACS scoring. Follow-up/portfolio stay
    // off — the Maricopa bulk parcel layer we'd need for owner rollups has
    // no unit-count field and its previously-documented FeatureServer URL
    // no longer resolves (verified while building this out). See
    // project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Hotspots live (Phoenix Urban Villages). Follow-up/portfolio pending a working bulk parcel source.',
  },
  {
    key: 'austin',
    label: 'Austin, TX',
    stateCode: 'TX',
    countyFips: '48453',
    countyName: 'Travis',
    center: [-97.7431, 30.2672],
    // TCAD itself (traviscad.org) still has no public REST API, but
    // Travis County TNR publishes the TCAD tax-roll parcel layer for
    // free via ArcGIS (taxmaps.traviscountytx.gov) — re-verified live
    // 2026-07-13. No unit count / sqft / sale price in this feed (see
    // austinAssessor.ts header for why), but owner, market value, year
    // built, lot size, and property class are real and live.
    assessorSupported: true,
    sosSupported: false,
    neighborhoodsSupported: false,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Travis County TNR parcel feed live (no units/sqft/sale price). See project-docs/data-sources-by-msa.md.',
  },
  {
    key: 'nashville',
    label: 'Nashville, TN',
    stateCode: 'TN',
    countyFips: '47037',
    countyName: 'Davidson',
    center: [-86.7816, 36.1627],
    assessorSupported: true,
    sosSupported: false,
    // Hotspots choropleth is live: 14 Community Planning Areas (Metro
    // Nashville GIS) + national Census ACS scoring. Follow-up/portfolio
    // stay off — nashvilleAssessor.ts's parcel FeatureServer
    // (Cadastral/Parcels_SP) 404s as of this writing (verified while
    // building this out); needs re-pointing before bulk owner-rollup
    // queries can work. See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Hotspots live (Nashville Community Planning Areas). Follow-up/portfolio pending a working bulk parcel source.',
  },
  {
    key: 'charlotte',
    label: 'Charlotte, NC',
    stateCode: 'NC',
    countyFips: '37119',
    countyName: 'Mecklenburg',
    center: [-80.8431, 35.2271],
    assessorSupported: true,
    sosSupported: false,
    // Hotspots choropleth is live: 15 Community Planning Areas (City of
    // Charlotte GIS) + national Census ACS scoring. Follow-up/portfolio
    // stay off — charlotteAssessor.ts's parcel FeatureServer
    // (meckgis.mecklenburgcountync.gov) 404s as of this writing (verified
    // while building this out). See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Hotspots live (Charlotte Community Planning Areas). Follow-up/portfolio pending a working bulk parcel source.',
  },
  {
    key: 'tampa',
    label: 'Tampa, FL',
    stateCode: 'FL',
    countyFips: '12057',
    countyName: 'Hillsborough',
    center: [-82.4572, 27.9506],
    assessorSupported: true,
    // Florida Sunbiz is the one non-Colorado SoS we have a reliable free
    // scraper for. See floridaSos.ts.
    sosSupported: true,
    // Hotspots choropleth is live: 107 active neighborhood associations
    // (City of Tampa Open Data) + national Census ACS scoring. Follow-up/
    // portfolio stay off — tampaAssessor.ts's parcel host
    // (maps.hcpafl.org) has been replaced by an unrelated single-page app
    // with no REST API surface left (verified while building this out).
    // See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Hotspots live (Tampa neighborhood associations). Follow-up/portfolio pending a working bulk parcel source.',
  },
  {
    key: 'raleigh',
    label: 'Raleigh, NC',
    stateCode: 'NC',
    countyFips: '37183',
    countyName: 'Wake',
    center: [-78.6382, 35.7796],
    assessorSupported: true,
    sosSupported: false,
    // Hotspots choropleth is live: 18 Citizens Advisory Council (CAC)
    // areas (City of Raleigh GIS, maps.raleighnc.gov) + national Census
    // ACS scoring. Follow-up/portfolio stay off pending owner-rollup
    // work. See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: false,
    portfolioSupported: false,
    notes: 'Hotspots live (Raleigh Citizens Advisory Council areas). Follow-up/portfolio pending owner-rollup work.',
  },
];

const BY_KEY = new Map<MarketKey, MarketConfig>(MARKETS.map((m) => [m.key, m]));
const BY_FIPS = new Map<string, MarketConfig>(MARKETS.map((m) => [m.countyFips, m]));
// By (stateCode + uppercased county name). Used as fallback when the
// geocode doesn't carry a FIPS code yet (Google Geocode gives county
// name; our census-geocode path gives FIPS).
const BY_STATE_COUNTY = new Map<string, MarketConfig>(
  MARKETS.map((m) => [`${m.stateCode}:${m.countyName.toUpperCase()}`, m])
);

export function getMarket(key: MarketKey): MarketConfig | undefined {
  return BY_KEY.get(key);
}

export function getMarketByFips(countyFips: string | undefined): MarketConfig | undefined {
  if (!countyFips) return undefined;
  return BY_FIPS.get(countyFips);
}

export function getMarketByStateCounty(
  stateCode: string | undefined,
  countyName: string | undefined
): MarketConfig | undefined {
  if (!stateCode || !countyName) return undefined;
  return BY_STATE_COUNTY.get(`${stateCode}:${countyName.toUpperCase()}`);
}

/**
 * Resolves a geocoded address to the matching market config.
 * FIPS wins when present; otherwise state+county name.
 * Used by every per-MSA dispatcher so routing is consistent.
 */
export function resolveMarket(args: {
  countyFips?: string;
  stateCode?: string;
  countyName?: string;
}): MarketConfig | undefined {
  return (
    getMarketByFips(args.countyFips) ??
    getMarketByStateCounty(args.stateCode, args.countyName)
  );
}

// Filtered view: markets where the assessor is live. Used by the frontend
// to populate the market picker without showing gated markets.
export function supportedAssessorMarkets(): MarketConfig[] {
  return MARKETS.filter((m) => m.assessorSupported);
}

// Same idea for the Hotspots choropleth — used by the frontend market
// selector to gray out/disable markets without a real neighborhood
// boundary source yet.
export function supportedNeighborhoodMarkets(): MarketConfig[] {
  return MARKETS.filter((m) => m.neighborhoodsSupported);
}
