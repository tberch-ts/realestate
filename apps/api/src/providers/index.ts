import type { GeocodedAddress, PropertySnapshot } from '@mfa/shared';
import { geocodeAddress } from './googleGeocode.js';
import { fetchDenverAssessor } from './denverAssessor.js';
import { fetchCensus } from './census.js';
import { fetchHudFmr } from './hud.js';
import { fetchAttom } from './attom.js';
import { fetchRentcast } from './rentcast.js';
import { fetchBls } from './bls.js';
import { fetchCrime } from './fbiUcr.js';
import { fetchLandlord } from './landlordFriendliness.js';
import { scoreBuyBox } from '../buyBox.js';

export async function buildPropertySnapshot(address: string): Promise<PropertySnapshot> {
  const geocode = await geocodeAddress(address);
  const resolved = geocode.status === 'ok' ? (geocode.data as GeocodedAddress) : null;

  const [assessor, census, hud, attom, rentcast, bls, crime, landlord] = await Promise.all([
    resolved ? fetchDenverAssessor(resolved) : notAvailable('denver_assessor', 'No geocode'),
    resolved ? fetchCensus(resolved) : notAvailable('census_acs', 'No geocode'),
    fetchHudFmr(),
    fetchAttom(),
    fetchRentcast(),
    resolved ? fetchBls(resolved) : notAvailable('bls_ces', 'No geocode'),
    resolved ? fetchCrime(resolved) : notAvailable('fbi_ucr', 'No geocode'),
    resolved ? fetchLandlord(resolved) : notAvailable('landlord_friendliness', 'No geocode'),
  ]);

  const partial: Omit<PropertySnapshot, 'buyBox'> = {
    address,
    geocode,
    assessor,
    census,
    hud,
    attom,
    rentcast,
    bls,
    crime,
    landlord,
  };
  const buyBox = scoreBuyBox(partial);
  return { ...partial, buyBox };
}

function notAvailable(provider: string, message: string) {
  return { provider, status: 'not_available' as const, message };
}

export { geocodeAddress };
