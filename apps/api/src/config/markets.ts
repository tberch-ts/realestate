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
    // Land leads stay off until the general Denver parcel layer (NOT
    // Middle_Housing_Stock, which is housing-only) is probed for vacant
    // property-class codes. One-line flip once verified — see
    // project-docs/data-sources-by-msa.md.
    landSupported: false,
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
    // Data ArcGIS) + national Census ACS scoring. Follow-up is live via the
    // Maricopa Parcel_Data_View layer (same endpoint as phoenixAssessor.ts),
    // multifamily filtered on PropertyUseDescription; no per-parcel unit
    // count on this layer, so follow-up rows show units as unknown. Portfolio
    // (owner rollups) still pending. See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: false,
    landSupported: false,
    notes: 'Hotspots + follow-up live (Phoenix Urban Villages; Maricopa parcels, no unit count). Portfolio/land pending.',
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
    // Follow-up needs a neighborhood polygon to scope the query AND a sale
    // date for hold-time scoring — Austin has neither: no hotspot boundary
    // layer wired yet, and Texas is a non-disclosure state so the Travis
    // feed carries no sale date/price. Both are hard blocks, so follow-up
    // (and neighborhoods, land) stay off until a boundary layer is added and
    // a sale-bearing source is found. Assessor single-address lookup works.
    neighborhoodsSupported: false,
    followupSupported: false,
    portfolioSupported: false,
    // Travis feed has no sale date/price — can't compute ownership length,
    // which is the land lead finder's key filter.
    landSupported: false,
    notes: 'Assessor lookup live (Travis County TNR parcels). Hotspots/follow-up/land pending — no neighborhood boundary layer and no sale date (TX non-disclosure).',
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
    // Nashville GIS) + national Census ACS scoring. Follow-up is live via
    // the Cadastral/Parcels layer (same endpoint as nashvilleAssessor.ts),
    // multifamily filtered on LUDesc; this layer has no year-built or
    // unit-count columns, so those show as unknown on follow-up rows.
    // Portfolio (owner rollups) still pending. See
    // project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: false,
    landSupported: false,
    notes: 'Hotspots + follow-up live (Nashville Community Planning Areas; Davidson parcels, no year/unit count). Portfolio/land pending.',
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
    // Charlotte GIS) + national Census ACS scoring. Follow-up is live via
    // the TaxParcel_camadata layer (same endpoint as charlotteAssessor.ts),
    // multifamily filtered on landuse_description, with real resunits/
    // yearbuilt/saledate/owner-state. Portfolio (owner rollups) still
    // pending. See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: false,
    landSupported: false,
    notes: 'Hotspots + follow-up live (Charlotte Community Planning Areas; Mecklenburg parcels). Portfolio/land pending.',
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
    // (City of Tampa Open Data) + national Census ACS scoring. Follow-up is
    // live via the Parcels/TaxParcel layer (same City-of-Tampa endpoint as
    // tampaAssessor.ts, which republishes the full Hillsborough roll),
    // multifamily filtered on FL DOR use codes 0300/0800; no unit-count
    // column, so units show as unknown. Portfolio (owner rollups) still
    // pending. See project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: false,
    // Land leads bypass the dead county host entirely: the Florida DOR
    // statewide parcel layer (FGIO ArcGIS) has standardized DOR_UC land-use
    // codes, sale year/price, and owner mailing state. See
    // hillsboroughLand.ts + project-docs/data-sources-by-msa.md.
    landSupported: true,
    notes: 'Hotspots + follow-up live (Tampa neighborhood associations; Hillsborough parcels, no unit count). Land leads live via FL DOR statewide parcels. Portfolio pending.',
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
    // ACS scoring. Follow-up is live via the Property/Property layer (same
    // endpoint as raleighAssessor.ts), apartment-use filtered with real
    // TOTUNITS/YEAR_BUILT/sale data (owner state parsed from the mailing
    // lines). Portfolio (owner rollups) still pending. See
    // project-docs/data-sources-by-msa.md.
    neighborhoodsSupported: true,
    followupSupported: true,
    portfolioSupported: false,
    // Wake County GIS parcels carry land class, deed acres, sale date/price,
    // and owner mailing address — everything the land lead finder needs.
    // See wakeLand.ts + project-docs/data-sources-by-msa.md.
    landSupported: true,
    notes: 'Hotspots + follow-up live (Raleigh Citizens Advisory Council areas; Wake parcels). Land leads live via Wake County GIS parcels. Portfolio pending owner-rollup work.',
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

// Markets with a verified vacant-land parcel source (land-use codes + sale
// dates). Used by the land dispatcher and the Land Leads market picker.
export function supportedLandMarkets(): MarketConfig[] {
  return MARKETS.filter((m) => m.landSupported);
}
