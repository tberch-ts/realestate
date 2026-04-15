import type { CrimeRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// FBI Crime Data Explorer (Crime Data API) is on api.data.gov.
// Requires a free api.data.gov key. Agency-level endpoints need an ORI.
// For v1 we leave this as a credentials-gated provider with the skeleton ready.

const NATIONAL_VIOLENT_RATE = 380.7; // per 100k, approximate recent FBI UCR baseline

export async function fetchCrime(_geocode: GeocodedAddress): Promise<ProviderResult<CrimeRecord>> {
  const provider = 'fbi_ucr';
  const key = process.env.FBI_API_KEY;

  if (!key) {
    return {
      provider,
      status: 'needs_credentials',
      message:
        'FBI Crime Data Explorer requires a free api.data.gov key. Register at https://api.data.gov/signup/ and set FBI_API_KEY.',
    };
  }

  // When we have a key, the real path is:
  //   1. Resolve geocode.locality + stateCode to an ORI (agency identifier) via
  //      the FBI agencies lookup, caching the mapping.
  //   2. GET /crime-data-api/api/violent/agency/{ORI}/{startYear}/{endYear}
  //   3. Sum violent crimes, divide by population, compare to NATIONAL_VIOLENT_RATE.
  //
  // Implementing the ORI lookup is non-trivial and low marginal value for Phase 2a,
  // so we short-circuit here until the user signals they want it wired up.
  return {
    provider,
    status: 'not_available',
    message: 'FBI_API_KEY set, but FBI UCR integration not yet implemented (ORI lookup pending).',
    data: { nationalAverageRate: NATIONAL_VIOLENT_RATE },
  };
}
