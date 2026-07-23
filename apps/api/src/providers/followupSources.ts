import type { FollowupProperty, MarketKey } from '@mfa/shared';
import { centroidFromGeometry, epochToIsoDate, num, stateFromMailingLine, str } from './followupCommon.js';

// Per-MSA config for the generalized follow-up provider (genericFollowup.ts).
// Follow-up = "multifamily parcels inside this neighborhood polygon, ranked
// by how likely the owner is to sell." Denver has its own provider
// (denverFollowup.ts) against a purpose-built Middle-Housing layer; every
// other market reuses its already-verified county assessor FeatureServer/
// MapServer — the SAME endpoint each `*Assessor.ts` uses for single-address
// lookups — with a multifamily WHERE filter and a spatial-intersect against
// the Hotspots neighborhood polygon.
//
// Every endpoint + field name below is reused from the matching
// `*Assessor.ts` provider (which were curl-verified live 2026-07-13) and the
// multifamily filters were curl-verified live while building this out — see
// project-docs/data-sources-by-msa.md "Follow-up — verification notes".
//
// A market gets an entry here (and `followupSupported: true` in markets.ts)
// only when its parcel layer has, at minimum: (a) a way to identify
// multifamily parcels (unit count OR a land-use/use-code value), (b) an
// owner name, and (c) a neighborhood polygon source in neighborhoodSources.ts
// to scope the query. Sale date + owner mailing state are used for scoring
// where present and left undefined where the layer doesn't carry them.
export interface FollowupSource {
  market: MarketKey;
  label: string;
  queryUrl: string; // ArcGIS FeatureServer/MapServer `.../query` endpoint (same as the assessor)
  homeState: string; // 2-letter; owner mailing state != this ⇒ out-of-state signal
  // WHERE selecting multifamily parcels. Wrapped in parens by the engine
  // before AND-ing the spatial + numeric filters, so `OR` here is safe.
  multifamilyWhere: string;
  // Numeric field for the UI's "min units" filter, when the layer has a real
  // per-parcel unit count. Omit when it doesn't (then min units is ignored —
  // the multifamilyWhere use-code is the only multifamily gate).
  unitsField?: string;
  // Numeric field for the UI's "min year built" filter, when present.
  yearField?: string;
  // Map one raw ArcGIS attributes row (+ its geometry) to a FollowupProperty,
  // or null to drop the row (e.g. no usable address).
  toProperty: (a: Record<string, unknown>, geometry: unknown, fallbackCenter: [number, number]) => FollowupProperty | null;
}

export const FOLLOWUP_SOURCES: Partial<Record<MarketKey, FollowupSource>> = {
  // Maricopa County — Parcel_Data_View (phoenixAssessor.ts). No per-parcel
  // unit count; multifamily identified via PropertyUseDescription text
  // buckets ("APARTMENTS 100+ UNITS 2 STORY", etc.). OwnerState is a real
  // 2-letter mailing state.
  phoenix: {
    market: 'phoenix',
    label: 'Maricopa County parcels (Parcel_Data_View)',
    queryUrl:
      'https://services.arcgis.com/ykpntM6e3tHvzKRJ/arcgis/rest/services/Parcel_Data_View/FeatureServer/0/query',
    homeState: 'AZ',
    multifamilyWhere: "PropertyUseDescription LIKE '%APARTMENT%'",
    yearField: 'ConstructionYear',
    toProperty: (a, g, fb) => {
      const address = str(a.PropertyFullStreetAddress);
      if (!address) return null;
      return {
        parcelId: str(a.APN),
        address,
        owner: str(a.OwnerName),
        ownerMailingState: str(a.OwnerState),
        units: undefined, // layer carries only bucketed text ranges, not a count
        yearBuilt: num(a.ConstructionYear),
        salePrice: num(a.SalePrice),
        saleDate: epochToIsoDate(a.SaleDate),
        sqft: num(a.LivableArea_SqFt),
        propertyClass: str(a.PropertyUseDescription),
        centroid: centroidFromGeometry(g, fb),
      };
    },
  },

  // Davidson County / Nashville — Cadastral/Parcels MapServer
  // (nashvilleAssessor.ts). No year-built or unit-count columns; multifamily
  // via LUDesc ("APARTMENT: LOW RISE (BUILT SINCE 1960)"). OwnState is the
  // owner mailing state; OwnDate is the deed/sale date (epoch ms).
  nashville: {
    market: 'nashville',
    label: 'Davidson County parcels (Cadastral/Parcels)',
    queryUrl: 'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query',
    homeState: 'TN',
    multifamilyWhere: "LUDesc LIKE '%APARTMENT%'",
    toProperty: (a, g, fb) => {
      const address = str(a.PropAddr);
      if (!address) return null;
      return {
        parcelId: str(a.APN),
        address,
        owner: str(a.Owner),
        ownerMailingState: str(a.OwnState),
        units: undefined,
        yearBuilt: undefined,
        salePrice: num(a.SalePrice),
        saleDate: epochToIsoDate(a.OwnDate),
        propertyClass: str(a.LUDesc),
        centroid: centroidFromGeometry(g, fb),
      };
    },
  },

  // Mecklenburg County / Charlotte — TaxParcel_camadata (charlotteAssessor.ts).
  // Has resunits/comunits, yearbuilt, saledate, and a `state` owner mailing
  // field. One row per building on multi-building complexes, so unit counts
  // can reflect a single building; `address` situs is occasionally null
  // (falls back to streetnumber+streetname).
  charlotte: {
    market: 'charlotte',
    label: 'Mecklenburg County parcels (TaxParcel_camadata)',
    queryUrl:
      'https://meckgis.mecklenburgcountync.gov/server/rest/services/TaxParcel_camadata/FeatureServer/0/query',
    homeState: 'NC',
    multifamilyWhere: "landuse_description LIKE '%MULTI%'",
    unitsField: 'resunits',
    yearField: 'yearbuilt',
    toProperty: (a, g, fb) => {
      const address =
        str(a.address) ?? [str(a.streetnumber), str(a.streetname)].filter(Boolean).join(' ').trim();
      if (!address) return null;
      const owner = a.ownrfrstnme
        ? [str(a.ownrfrstnme), str(a.ownrlstnme)].filter(Boolean).join(' ').trim() || undefined
        : str(a.ownrlstnme);
      return {
        parcelId: str(a.pid) ?? str(a.parcelid),
        address,
        owner,
        ownerMailingState: str(a.state),
        units: num(a.resunits) || num(a.comunits),
        yearBuilt: num(a.yearbuilt),
        salePrice: num(a.saleprice),
        saleDate: epochToIsoDate(a.saledate),
        sqft: num(a.heatedarea) ?? num(a.finarea) ?? num(a.totalarea),
        propertyClass: str(a.landuse_description),
        centroid: centroidFromGeometry(g, fb),
      };
    },
  },

  // Hillsborough County / Tampa — Parcels/TaxParcel (tampaAssessor.ts). No
  // unit count; multifamily via FL DOR use code (0300 = 10+ units, 0800 =
  // <10 units). STATE is the owner mailing state; ACT is actual year built;
  // S_DATE/AMT are sale date/amount.
  tampa: {
    market: 'tampa',
    label: 'Hillsborough County parcels (Parcels/TaxParcel)',
    queryUrl: 'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query',
    homeState: 'FL',
    multifamilyWhere: "DOR_C IN ('0300','0800')",
    yearField: 'ACT',
    toProperty: (a, g, fb) => {
      const address = str(a.SITE_ADDR);
      if (!address) return null;
      return {
        parcelId: str(a.STRAP) ?? str(a.FOLIO),
        address,
        owner: str(a.OWNER),
        ownerMailingState: str(a.STATE),
        units: undefined,
        yearBuilt: num(a.ACT),
        salePrice: num(a.AMT),
        saleDate: epochToIsoDate(a.S_DATE),
        propertyClass: str(a.DOR_C),
        centroid: centroidFromGeometry(g, fb),
      };
    },
  },

  // Wake County / Raleigh — Property/Property (raleighAssessor.ts). Real
  // TOTUNITS + YEAR_BUILT + TOTSALPRICE/SALE_DATE. No dedicated owner-state
  // field — it's parsed from the free-text mailing lines (ADDR2/ADDR3).
  // Filtered to apartment use (%APT%) so unit-bearing shopping centers /
  // storage don't leak in.
  raleigh: {
    market: 'raleigh',
    label: 'Wake County parcels (Property/Property)',
    queryUrl: 'https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/FeatureServer/0/query',
    homeState: 'NC',
    multifamilyWhere: "TYPE_USE_DECODE LIKE '%APT%'",
    unitsField: 'TOTUNITS',
    yearField: 'YEAR_BUILT',
    toProperty: (a, g, fb) => {
      const address = str(a.SITE_ADDRESS);
      if (!address) return null;
      return {
        parcelId: str(a.REID) ?? str(a.PIN_NUM),
        address,
        owner: str(a.OWNER),
        ownerMailingState: stateFromMailingLine(a.ADDR3, a.ADDR2),
        units: num(a.TOTUNITS),
        yearBuilt: num(a.YEAR_BUILT),
        salePrice: num(a.TOTSALPRICE),
        saleDate: epochToIsoDate(a.SALE_DATE),
        sqft: num(a.HEATEDAREA),
        propertyClass: str(a.TYPE_USE_DECODE),
        centroid: centroidFromGeometry(g, fb),
      };
    },
  },
};

export function getFollowupSource(market: MarketKey): FollowupSource | undefined {
  return FOLLOWUP_SOURCES[market];
}
