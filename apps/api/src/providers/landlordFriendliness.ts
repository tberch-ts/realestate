import type { GeocodedAddress, LandlordRecord, ProviderResult } from '@mfa/shared';

// Static curated lookup. Score 0-100 where higher = more landlord-friendly.
// Based on widely-cited indicators: presence of statewide rent control,
// eviction timelines, security deposit caps, notice periods, tenant-screening freedom,
// implied warranty of habitability strictness. Not legal advice.
export const STATE_TABLE: Record<
  string,
  { score: number; tier: LandlordRecord['stateTier']; notes?: string }
> = {
  TX: { score: 88, tier: 'friendly', notes: 'No rent control, fast eviction, no deposit cap.' },
  FL: { score: 85, tier: 'friendly', notes: 'No statewide rent control; 3-day pay-or-quit.' },
  GA: { score: 84, tier: 'friendly', notes: 'No rent control, 60-day notice to terminate.' },
  TN: { score: 82, tier: 'friendly', notes: 'No rent control; landlord-favorable eviction timeline.' },
  NC: { score: 80, tier: 'friendly' },
  SC: { score: 80, tier: 'friendly' },
  AL: { score: 82, tier: 'friendly' },
  AR: { score: 90, tier: 'friendly', notes: 'Often cited as most landlord-friendly.' },
  OK: { score: 82, tier: 'friendly' },
  IN: { score: 78, tier: 'friendly' },
  KY: { score: 76, tier: 'friendly' },
  KS: { score: 75, tier: 'friendly' },
  MO: { score: 78, tier: 'friendly' },
  WV: { score: 78, tier: 'friendly' },
  OH: { score: 72, tier: 'friendly' },
  AZ: { score: 74, tier: 'friendly' },
  NV: { score: 68, tier: 'moderate' },
  ID: { score: 75, tier: 'friendly' },
  UT: { score: 74, tier: 'friendly' },
  NM: { score: 70, tier: 'moderate', notes: 'No statewide rent control; 3-day notice for non-payment; moderate tenant protections.' },
  CO: {
    score: 55,
    tier: 'moderate',
    notes:
      'No statewide rent control, but HB23-1098/HB23-1115 added tenant protections. Denver has stricter local ordinances.',
  },
  WA: { score: 42, tier: 'unfriendly', notes: 'Just-cause eviction, tight notice windows.' },
  OR: { score: 38, tier: 'unfriendly', notes: 'Statewide rent control (SB 608).' },
  CA: { score: 30, tier: 'unfriendly', notes: 'AB 1482 statewide rent cap + just-cause.' },
  NY: { score: 28, tier: 'unfriendly', notes: 'HSTPA 2019 + rent stabilization in many markets.' },
  NJ: { score: 40, tier: 'unfriendly' },
  MA: { score: 45, tier: 'unfriendly' },
  MN: { score: 55, tier: 'moderate' },
  IL: { score: 50, tier: 'moderate', notes: 'State preempts local rent control but Chicago has RLTO.' },
  MI: { score: 62, tier: 'moderate' },
  PA: { score: 65, tier: 'moderate' },
  VA: { score: 60, tier: 'moderate' },
  WI: { score: 68, tier: 'moderate' },
  DC: { score: 30, tier: 'unfriendly', notes: 'Strong rent control + tenant protections.' },
};

const CITY_OVERRIDES: Record<string, { tier: LandlordRecord['stateTier']; notes: string }> = {
  'denver,co': {
    tier: 'moderate',
    notes: 'Denver tenant notice rules, source-of-income protections.',
  },
  'portland,or': { tier: 'unfriendly', notes: 'Stricter than statewide Oregon rules.' },
  'seattle,wa': { tier: 'unfriendly', notes: 'Just-cause + move-in fee caps + roommate rules.' },
  'minneapolis,mn': { tier: 'moderate', notes: 'Tenant screening restrictions.' },
  'saint paul,mn': { tier: 'unfriendly', notes: 'Rent stabilization (3%).' },
  'chicago,il': { tier: 'unfriendly', notes: 'RLTO + Fair Notice.' },
};

export async function fetchLandlord(
  geocode: GeocodedAddress
): Promise<ProviderResult<LandlordRecord>> {
  const provider = 'landlord_friendliness';
  const stateCode = geocode.stateCode;
  if (!stateCode) {
    return { provider, status: 'not_available', message: 'No state resolved from geocode' };
  }
  const row = STATE_TABLE[stateCode];
  if (!row) {
    return { provider, status: 'not_available', message: `Unmapped state: ${stateCode}` };
  }

  const cityRaw = geocode.components?.locality ?? geocode.components?.postal_town;
  let override: LandlordRecord['cityOverride'];
  if (cityRaw) {
    const key = `${cityRaw.toLowerCase()},${stateCode.toLowerCase()}`;
    const hit = CITY_OVERRIDES[key];
    if (hit) override = { city: cityRaw, tier: hit.tier, notes: hit.notes };
  }

  return {
    provider,
    status: 'ok',
    data: {
      stateCode,
      stateScore: row.score,
      stateTier: row.tier,
      cityOverride: override,
      notes: row.notes,
    },
    fetchedAt: new Date().toISOString(),
  };
}
