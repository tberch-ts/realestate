// One-click Zillow deep links for the land strategy's manual research
// workflow (the "public tools" half of market saturation: verify sold
// lots + new construction on Zillow with your own eyes).
//
// NOTE: Zillow has no public API and `searchQueryState` is undocumented —
// its format can drift. These links are a convenience only: if Zillow
// changes the param format, the link degrades to a plain location search
// (Zillow ignores unknown params), never a hard failure. Do NOT build
// anything load-bearing on these.

function zillowUrl(query: string, filterState: Record<string, unknown>): string {
  const base = `https://www.zillow.com/homes/${encodeURIComponent(query.replace(/\s+/g, '-'))}_rb/`;
  const sqs = {
    usersSearchTerm: query,
    filterState,
    isListVisible: true,
  };
  return `${base}?searchQueryState=${encodeURIComponent(JSON.stringify(sqs))}`;
}

// Land-only filter: every home type off except Lots/Land.
const LAND_ONLY = {
  isSingleFamily: { value: false },
  isTownhouse: { value: false },
  isMultiFamily: { value: false },
  isCondo: { value: false },
  isApartment: { value: false },
  isManufactured: { value: false },
  isLotLand: { value: true },
};

// Recently SOLD lots/land — the saturation signal ("gold mine" check).
export function zillowSoldLotsUrl(query: string): string {
  return zillowUrl(query, {
    ...LAND_ONLY,
    isForSaleByAgent: { value: false },
    isForSaleByOwner: { value: false },
    isNewConstruction: { value: false },
    isComingSoon: { value: false },
    isAuction: { value: false },
    isForSaleForeclosure: { value: false },
    isRecentlySold: { value: true },
  });
}

// Active new-construction listings — proof builders are building here.
export function zillowNewConstructionUrl(query: string): string {
  return zillowUrl(query, {
    isSingleFamily: { value: true },
    isTownhouse: { value: false },
    isMultiFamily: { value: false },
    isCondo: { value: false },
    isApartment: { value: false },
    isManufactured: { value: false },
    isLotLand: { value: false },
    isNewConstruction: { value: true },
    isForSaleByAgent: { value: false },
    isForSaleByOwner: { value: false },
    isComingSoon: { value: false },
    isAuction: { value: false },
    isForSaleForeclosure: { value: false },
  });
}

// Lots/land currently FOR SALE — competition + price-anchor check.
export function zillowForSaleLotsUrl(query: string): string {
  return zillowUrl(query, LAND_ONLY);
}
