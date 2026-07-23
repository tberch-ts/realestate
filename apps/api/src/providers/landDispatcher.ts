import type { LandLeadFilters, LandLeadResult, MarketKey, ProviderResult } from '@mfa/shared';
import { getMarket } from '../config/markets.js';
import { fetchWakeLandLeads } from './wakeLand.js';
import { fetchHillsboroughLandLeads } from './hillsboroughLand.js';

// Routes a vacant-land lead request to the right per-market provider —
// same shape as followupDispatcher.ts. A market needs a verified parcel
// source with (a) a land-use/property-class field that flags vacant
// parcels, (b) a sale/deed date for hold-time computation (the strategy's
// key filter is 10+ years held), and (c) owner name + mailing address.
// See markets.ts `landSupported` and project-docs/data-sources-by-msa.md
// "Vacant land / lots" for why each market is on or off.
export async function fetchLandLeads(
  market: MarketKey,
  filters: LandLeadFilters
): Promise<ProviderResult<LandLeadResult>> {
  const provider = 'land_leads';
  const cfg = getMarket(market);
  if (!cfg) {
    return { provider, status: 'not_available', message: `Unknown market '${market}'` };
  }
  if (!cfg.landSupported) {
    return {
      provider,
      status: 'not_available',
      message: cfg.notes
        ? `Vacant-land leads aren't available for ${cfg.label} yet — ${cfg.notes}`
        : `Vacant-land leads aren't available for ${cfg.label} yet.`,
    };
  }

  switch (market) {
    case 'raleigh':
      return fetchWakeLandLeads(filters);
    case 'tampa':
      return fetchHillsboroughLandLeads(filters);
    default:
      // Unreachable while only raleigh/tampa have landSupported: true —
      // kept so a market flipped to true without a provider fails loudly.
      return { provider, status: 'not_available', message: `Land-lead dispatch missing for market ${market}` };
  }
}
