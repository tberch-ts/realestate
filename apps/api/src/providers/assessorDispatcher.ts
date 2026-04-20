import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';
import { resolveMarket } from '../config/markets.js';
import { fetchDenverAssessor } from './denverAssessor.js';
import { fetchPhoenixAssessor } from './phoenixAssessor.js';
import { fetchAustinAssessor } from './austinAssessor.js';
import { fetchNashvilleAssessor } from './nashvilleAssessor.js';
import { fetchCharlotteAssessor } from './charlotteAssessor.js';
import { fetchTampaAssessor } from './tampaAssessor.js';
import { fetchRaleighAssessor } from './raleighAssessor.js';

// Routes a geocoded address to the right county assessor based on the
// market config. Falls back to a helpful `not_available` when the
// address isn't in a supported market — the snapshot builder then uses
// the ATTOM/RentCast providers instead.
//
// Adding a new MSA: append a new per-MSA fetcher + wire it here. The
// market config in config/markets.ts is the single source of routing
// truth (via resolveMarket).
export async function fetchAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const market = resolveMarket({
    countyFips: geocode.countyFips,
    stateCode: geocode.stateCode,
    countyName: geocode.components?.administrative_area_level_2?.replace(/ County$/i, ''),
  });

  if (!market) {
    return {
      provider: 'assessor',
      status: 'not_available',
      message: `No supported county assessor for ${geocode.components?.administrative_area_level_2 ?? geocode.stateCode ?? 'this location'}`,
    };
  }

  switch (market.key) {
    case 'denver':
      return fetchDenverAssessor(geocode);
    case 'phoenix':
      return fetchPhoenixAssessor(geocode);
    case 'austin':
      return fetchAustinAssessor(geocode);
    case 'nashville':
      return fetchNashvilleAssessor(geocode);
    case 'charlotte':
      return fetchCharlotteAssessor(geocode);
    case 'tampa':
      return fetchTampaAssessor(geocode);
    case 'raleigh':
      return fetchRaleighAssessor(geocode);
    default: {
      // exhaustiveness check — TypeScript will flag missing cases
      const _exhaustive: never = market.key;
      void _exhaustive;
      return {
        provider: 'assessor',
        status: 'not_available',
        message: `Assessor dispatch missing for market ${market.key as string}`,
      };
    }
  }
}
