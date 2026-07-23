import type { MarketKey } from '@mfa/shared';

// Shared county-parcel ArcGIS access for the land strategy. One source of
// truth for the FeatureServer endpoints + field names + WHERE-clause
// builders, consumed by both landSaturation.ts (per-ZIP activity) and
// builderSearch.ts (per-builder discovery). Adding a market here lights up
// both features at once.

export interface LandParcelSource {
  url: string;
  homeState: string;            // for SoS routing + out-of-state heuristics
  zipField: string;             // site ZIP
  priceField: string;
  ownerField: string;
  parcelIdField: string;
  siteAddrField?: string;
  mailingFields: string[];      // joined for the owner's mailing address
  soldWhere: (cutoffIso: string) => string;   // vacant lots sold in last 12mo
  newConWhere: (minYear: number) => string;    // structures built in last ~2y
}

export const LAND_PARCEL_SOURCES: Partial<Record<MarketKey, LandParcelSource>> = {
  raleigh: {
    url: 'https://maps.wake.gov/arcgis/rest/services/Property/Parcels/FeatureServer/0/query',
    homeState: 'NC',
    zipField: 'ZIPNUM',
    priceField: 'TOTSALPRICE',
    ownerField: 'OWNER',
    parcelIdField: 'PIN_NUM',
    siteAddrField: 'SITE_ADDRESS',
    mailingFields: ['ADDR1', 'ADDR2', 'ADDR3'],
    soldWhere: (cutoff) => `LAND_CLASS = 'VAC' AND SALE_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `YEAR_BUILT >= ${minYear}`,
  },
  tampa: {
    url: 'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query',
    homeState: 'FL',
    zipField: 'SITE_ZIP',
    priceField: 'AMT',
    ownerField: 'OWNER',
    parcelIdField: 'FOLIO',
    siteAddrField: 'SITE_ADDR',
    mailingFields: ['ADDR_1', 'ADDR_2', 'CITY', 'STATE', 'ZIP'],
    soldWhere: (cutoff) => `DOR_C IN ('0000','1000','4000') AND S_DATE >= TIMESTAMP '${cutoff} 00:00:00'`,
    newConWhere: (minYear) => `ACT >= ${minYear}`,
  },
};

// Low-level ArcGIS query POST. Throws on HTTP or ArcGIS-level errors so
// callers can normalize into a ProviderResult envelope.
export async function arcgisQuery(
  url: string,
  params: Record<string, string>
): Promise<Array<{ attributes: Record<string, unknown>; geometry?: unknown; centroid?: { x: number; y: number } }>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const body = (await res.json()) as {
    features?: Array<{ attributes: Record<string, unknown>; geometry?: unknown; centroid?: { x: number; y: number } }>;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);
  return body.features ?? [];
}

// Fold ZIP+4 / trailing-dash ZIPs to a 5-digit key.
export function zip5(z: string | undefined): string | undefined {
  if (!z) return undefined;
  const m = /\d{5}/.exec(z);
  return m ? m[0] : undefined;
}

export function ringsCentroid(geometry: unknown): { x: number; y: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rings = (geometry as any)?.rings as number[][][] | undefined;
  if (!rings?.length) return null;
  const pts = rings.flat();
  if (!pts.length) return null;
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return { x: sx / pts.length, y: sy / pts.length };
}

// Min-max scale a value into 0-100 against a population of values.
export function scale(v: number, all: number[]): number {
  const max = Math.max(...all);
  const min = Math.min(...all);
  if (max === min) return max > 0 ? 100 : 0;
  return ((v - min) / (max - min)) * 100;
}
