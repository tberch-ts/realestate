import type { GeocodedAddress, PropertySnapshot } from '@mfa/shared';
import { geocodeAddress } from './googleGeocode.js';
import { fetchDenverAssessor } from './denverAssessor.js';
import { fetchCensus } from './census.js';
import { fetchHudFmr } from './hud.js';
import { fetchAttom } from './attom.js';
import { fetchRentcast } from './rentcast.js';

export async function buildPropertySnapshot(address: string): Promise<PropertySnapshot> {
  const geocode = await geocodeAddress(address);
  const resolved = geocode.status === 'ok' ? (geocode.data as GeocodedAddress) : null;

  // Run downstream providers in parallel if we have coords; otherwise short-circuit.
  const [assessor, census, hud, attom, rentcast] = await Promise.all([
    resolved ? fetchDenverAssessor(resolved) : notAvailable('denver_assessor', 'No geocode'),
    resolved ? fetchCensus(resolved) : notAvailable('census_acs', 'No geocode'),
    fetchHudFmr(),
    fetchAttom(),
    fetchRentcast(),
  ]);

  return {
    address,
    geocode,
    assessor,
    census,
    hud,
    attom,
    rentcast,
  };
}

function notAvailable(provider: string, message: string) {
  return { provider, status: 'not_available' as const, message };
}

export { geocodeAddress };
