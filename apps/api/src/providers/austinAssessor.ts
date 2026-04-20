import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Travis Central Appraisal District (TCAD) — the public-facing property
// database for Travis County / Austin. As of April 2026 there is NO
// free REST or FeatureServer endpoint published:
//
//   - traviscad.org/propertysearch — is a portal-only web UI
//   - There is no ArcGIS Open Data mirror with assessor attributes
//     (Travis County Open Data has planning/transportation but not tax)
//   - Bulk roll is available as a Public Information Request via
//     public-information@tcad.org — paid, manually fulfilled
//   - A 2020 certified roll snapshot lives on UT Austin's Dataverse
//     (https://dataverse.tdl.org) but it's static, ~4 years stale
//
// Rather than screen-scrape the portal (fragile, likely violates ToS),
// this provider returns a structured `not_available` result so the UI
// can show "Austin assessor not yet supported" without breaking.
// The propertySnapshot builder then falls back to ATTOM/RentCast for
// Austin addresses.
//
// To enable: either (a) wire up a paid TCAD data subscription, (b) the
// user opts into screen-scraping the public portal (not recommended),
// or (c) TCAD publishes an Open Data feed.
export async function fetchAustinAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'austin_assessor';
  if (geocode.stateCode !== 'TX') {
    return {
      provider,
      status: 'not_available',
      message: 'TCAD only covers addresses in Travis County, TX',
    };
  }

  // Deliberately not implemented — see header comment. Structured
  // response so the snapshot builder knows to fall back to ATTOM.
  return {
    provider,
    status: 'not_available',
    message:
      'TCAD has no free public API. Use ATTOM/RentCast for Austin, or request bulk roll via public-information@tcad.org.',
  };
}
