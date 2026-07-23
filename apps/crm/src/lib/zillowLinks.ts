// One-click Zillow deep links for the land strategy's manual research
// workflow (the "public tools" half of market saturation: verify sold
// lots + new construction on Zillow with your own eyes).
//
// NOTE: Zillow has no public API and `searchQueryState` is undocumented —
// its format can drift. These links are a convenience only: if Zillow
// changes the param format, the link degrades to a plain location search
// (Zillow ignores unknown params), never a hard failure. Do NOT build
// anything load-bearing on these.
//
// A bare ZIP in the path (e.g. `33598_rb`) with no map bounds lets
// Zillow's geocoder fall back to a wrong default location (observed:
// "33598" rendering Lakewood, CO). So when a centroid is available we pin
// the map to real coordinates via `mapBounds` — coordinates can't be
// mis-geocoded — and only use the search term as a label/fallback.

// [lng, lat] — matches the GeoJSON/centroid convention used across the app.
export type LngLat = [number, number];

// ~0.08° ≈ 5–6 miles; wide enough to cover a whole ZIP, tight enough to
// stay local. A ZIP is a few miles across; err generous so nothing hides.
const BOUND_DELTA = 0.08;

function zillowUrl(query: string, filterState: Record<string, unknown>, center?: LngLat): string {
  // Path slug: strip commas/spaces so a qualified term like "33598, FL"
  // still yields a clean `33598-FL_rb` path.
  const slug = query.trim().replace(/[,\s]+/g, '-');
  const base = `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`;
  const sqs: Record<string, unknown> = {
    usersSearchTerm: query,
    filterState,
    isListVisible: true,
  };
  if (center) {
    const [lng, lat] = center;
    sqs.mapBounds = {
      west: lng - BOUND_DELTA,
      east: lng + BOUND_DELTA,
      south: lat - BOUND_DELTA,
      north: lat + BOUND_DELTA,
    };
    sqs.isMapVisible = true;
  }
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
export function zillowSoldLotsUrl(query: string, center?: LngLat): string {
  return zillowUrl(
    query,
    {
      ...LAND_ONLY,
      isForSaleByAgent: { value: false },
      isForSaleByOwner: { value: false },
      isNewConstruction: { value: false },
      isComingSoon: { value: false },
      isAuction: { value: false },
      isForSaleForeclosure: { value: false },
      isRecentlySold: { value: true },
    },
    center
  );
}

// Active new-construction listings — proof builders are building here.
export function zillowNewConstructionUrl(query: string, center?: LngLat): string {
  return zillowUrl(
    query,
    {
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
    },
    center
  );
}

// Lots/land currently FOR SALE — competition + price-anchor check.
export function zillowForSaleLotsUrl(query: string, center?: LngLat): string {
  return zillowUrl(query, LAND_ONLY, center);
}
