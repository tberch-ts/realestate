import type { FollowupResult, MarketKey, ProviderResult } from '@mfa/shared';
import { getMarket } from '../config/markets.js';
import { fetchDenverFollowup } from './denverFollowup.js';

// Routes a follow-up-candidates request to the right per-market provider,
// same shape as assessorDispatcher.ts / sosDispatcher.ts. Today only
// Denver has a real provider — every other market returns `not_available`
// with a message explaining why (see markets.ts `followupSupported` and
// project-docs/data-sources-by-msa.md "Follow-up / Portfolio — verification
// notes").
//
// Follow-up needs bulk, field-mapped parcel data (owner, unit count, sale
// date, mailing state) for every property in a neighborhood polygon — a
// much higher bar than the neighborhoods choropleth (which only needs
// Census + a boundary layer). Adding a market here means first confirming
// its assessor FeatureServer is reachable AND has a real unit-count field,
// then porting denverFollowup.ts's spatial-query pattern.
export async function fetchFollowup(
  market: MarketKey,
  opts: { zone: string; minUnits?: number; minYear?: number; limit?: number }
): Promise<ProviderResult<FollowupResult>> {
  const provider = 'followup';
  const cfg = getMarket(market);
  if (!cfg) {
    return { provider, status: 'not_available', message: `Unknown market '${market}'` };
  }
  if (!cfg.followupSupported) {
    return {
      provider,
      status: 'not_available',
      message: cfg.notes
        ? `Follow-up candidates aren't available for ${cfg.label} yet — ${cfg.notes}`
        : `Follow-up candidates aren't available for ${cfg.label} yet.`,
    };
  }

  switch (market) {
    case 'denver':
      return fetchDenverFollowup(opts);
    default: {
      // Every other market has followupSupported: false today, so this is
      // unreachable — kept for the exhaustiveness check below to catch a
      // forgotten case when a market flips to true.
      return { provider, status: 'not_available', message: `Follow-up dispatch missing for market ${market}` };
    }
  }
}
