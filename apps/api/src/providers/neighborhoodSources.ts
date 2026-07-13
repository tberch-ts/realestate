import type { MarketKey } from '@mfa/shared';

// Per-MSA neighborhood/submarket boundary sources for the Hotspots
// choropleth. Census ACS scoring (income/rent/population/rent-burden) is
// national and identical across markets — see neighborhoods.ts. The ONLY
// per-market piece is the polygon layer: every city publishes its own
// "neighborhoods" concept under a different name, on a different host,
// with a different name field, and often nothing at all.
//
// Every entry below was verified live (curl'd `<url>?f=json` and a sample
// `/query?...&f=geojson` request) while building this out — see
// project-docs/data-sources-by-msa.md for the per-market verification
// notes and counts. Only add a market here once you've done the same;
// a stale/guessed ArcGIS slug fails silently as an empty FeatureCollection.
export interface NeighborhoodSource {
  market: MarketKey;
  label: string; // human label for logs / API metadata
  queryUrl: string; // ArcGIS FeatureServer/MapServer `.../query` endpoint
  where: string; // WHERE clause; '1=1' when no filter needed
  nameOf: (props: Record<string, unknown>) => string; // resolve a display name from raw feature properties
  fallbackCenter: [number, number]; // [lng, lat] — matches markets.ts `center`
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export const NEIGHBORHOOD_SOURCES: Partial<Record<MarketKey, NeighborhoodSource>> = {
  denver: {
    market: 'denver',
    label: 'Denver statistical neighborhoods (Denver Open Data ArcGIS)',
    queryUrl:
      'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/Neighborhoods/FeatureServer/0/query',
    where: '1=1',
    nameOf: (p) => str(p.NBHD_NAME) ?? str(p.nbhd_name) ?? str(p.NAME) ?? 'Unknown',
    fallbackCenter: [-104.99, 39.74],
  },

  // 15 Urban Villages — City of Phoenix Open Data (maps.phoenix.gov).
  // Verified live: MapServer/0, field `NAME`, geometryType Polygon, 15
  // features (e.g. "Ahwatukee Foothills", "Camelback East", "Alhambra").
  phoenix: {
    market: 'phoenix',
    label: 'Phoenix Urban Villages (City of Phoenix Open Data ArcGIS)',
    queryUrl: 'https://maps.phoenix.gov/pub/rest/services/Public/Villages/MapServer/0/query',
    where: '1=1',
    nameOf: (p) => str(p.NAME) ?? 'Unknown',
    fallbackCenter: [-112.074, 33.4484],
  },

  // 14 Community Planning Areas — Metro Nashville GIS
  // (maps.nashville.gov/arcgis/rest/services/Boundaries/Boundaries/
  // MapServer, layer 1). Same host as nashvilleAssessor.ts. Verified
  // live, field `CommunityName` (e.g. "Joelton", "Madison", "Bellevue").
  nashville: {
    market: 'nashville',
    label: 'Nashville Community Planning Areas (Metro Nashville GIS)',
    queryUrl: 'https://maps.nashville.gov/arcgis/rest/services/Boundaries/Boundaries/MapServer/1/query',
    where: '1=1',
    nameOf: (p) => str(p.CommunityName) ?? 'Unknown',
    fallbackCenter: [-86.7816, 36.1627],
  },

  // 15 Community Planning Areas — City of Charlotte GIS (ArcGIS Online
  // hosted, org 9Nl857LBlQVyzq54). NOT the same as the ~458-polygon
  // "Neighborhood Profile Area" (NPA) layer that also exists for
  // Charlotte — NPA is too granular (458 tiny areas would take minutes
  // of sequential Census lookups on every cache warm, since the Census
  // geocoder/ACS pair has to be hit one-at-a-time to avoid 503s — see
  // neighborhoods.ts). Community Planning Areas gives the same city-wide
  // coverage at Denver-comparable granularity (15 areas) with real names
  // ("East Inner", "North Inner", "South District", …).
  charlotte: {
    market: 'charlotte',
    label: 'Charlotte Community Planning Areas (City of Charlotte GIS)',
    queryUrl:
      'https://services.arcgis.com/9Nl857LBlQVyzq54/arcgis/rest/services/CommunityPlanningArea/FeatureServer/0/query',
    where: '1=1',
    nameOf: (p) => str(p.Name) ?? 'Unknown',
    fallbackCenter: [-80.8431, 35.2271],
  },

  // 107 active Neighborhood Association areas — City of Tampa GIS
  // (arcgis.tampagov.net). The layer also carries ~53 "Inactive"
  // associations (defunct/merged) — filtered out via NEIGHSTATUS so
  // stale zero-population polygons don't pollute the map. Verified
  // live, name field `AssocLabel` (e.g. "Drew Park", "Ybor City").
  tampa: {
    market: 'tampa',
    label: 'Tampa neighborhood associations (City of Tampa Open Data, active only)',
    queryUrl: 'https://arcgis.tampagov.net/arcgis/rest/services/OpenData/Boundary/MapServer/5/query',
    where: "NEIGHSTATUS='Active'",
    nameOf: (p) => str(p.AssocLabel) ?? str(p.Association) ?? 'Unknown',
    fallbackCenter: [-82.4572, 27.9506],
  },

  // 18 Citizens Advisory Council (CAC) areas — City of Raleigh GIS
  // (maps.raleighnc.gov). Same host as raleighAssessor.ts. Verified
  // live, field `CAC` (e.g. "North", "Northwest", "Glenwood").
  raleigh: {
    market: 'raleigh',
    label: 'Raleigh Citizens Advisory Council areas (City of Raleigh GIS)',
    queryUrl: 'https://maps.raleighnc.gov/arcgis/rest/services/Boundaries/MapServer/1/query',
    where: '1=1',
    nameOf: (p) => str(p.CAC) ?? str(p.NAME) ?? 'Unknown',
    fallbackCenter: [-78.6382, 35.7796],
  },

  // Austin intentionally omitted — see project-docs/data-sources-by-msa.md
  // "Neighborhoods — verification notes" for what was checked and why
  // it's not lit up yet.
};

export function getNeighborhoodSource(market: MarketKey): NeighborhoodSource | undefined {
  return NEIGHBORHOOD_SOURCES[market];
}
