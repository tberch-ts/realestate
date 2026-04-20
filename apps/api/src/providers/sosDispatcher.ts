import type { ProviderResult, SosEntity } from '@mfa/shared';
import { fetchSosEntity as fetchColoradoSos } from './coloradoSos.js';
import { fetchFloridaSosEntity } from './floridaSos.js';

// Routes a business-entity search to the right state's SoS scraper.
// Today supports CO (original) + FL (Sunbiz). Other states are stubbed
// as `not_available` with a message pointing at the public portal.
//
// Each state needs its own scraper because every SoS has a different
// HTML layout, session-cookie handshake, and (in some cases) pay-per-
// search paywall. Documented in docs/data-sources-by-msa.md.
export async function fetchSosByState(
  name: string,
  stateCode: string
): Promise<ProviderResult<SosEntity | null>> {
  const state = stateCode.toUpperCase();
  switch (state) {
    case 'CO':
      return fetchColoradoSos(name);
    case 'FL':
      return fetchFloridaSosEntity(name);

    // -------- Unimplemented but endpoint-documented --------
    case 'AZ':
      return {
        provider: 'arizona_sos',
        status: 'not_available',
        message:
          'AZ business entities live at the AZ Corporation Commission (ecorp.azcc.gov). Scraper not yet implemented — see docs/data-sources-by-msa.md.',
      };
    case 'TX':
      return {
        provider: 'texas_sos',
        status: 'needs_credentials',
        message:
          'TX SOSDirect charges $1/search. Needs a paid account + session handling — not a free data source.',
      };
    case 'TN':
      return {
        provider: 'tennessee_sos',
        status: 'not_available',
        message:
          'TN business search at tnbear.tn.gov is free; scraper not yet implemented — see docs/data-sources-by-msa.md.',
      };
    case 'NC':
      return {
        provider: 'north_carolina_sos',
        status: 'not_available',
        message:
          'NC business search at sosnc.gov is free; scraper not yet implemented — see docs/data-sources-by-msa.md.',
      };

    default:
      return {
        provider: 'sos',
        status: 'not_available',
        message: `No SoS scraper configured for state ${stateCode}`,
      };
  }
}
