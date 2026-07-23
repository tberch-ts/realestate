import type { FollowupResult, MarketKey, ProviderResult } from '@mfa/shared';
import { getMarket } from '../config/markets.js';
import { fetchDenverFollowup } from './denverFollowup.js';
import { fetchGenericFollowup } from './genericFollowup.js';

// Routes a follow-up-candidates request to the right per-market provider,
// same shape as assessorDispatcher.ts / sosDispatcher.ts. Denver uses its
// own provider (a purpose-built Middle-Housing layer with real unit counts);
// every other supported market goes through the generalized provider, which
// spatial-queries that market's county assessor parcel layer for multifamily
// parcels inside the neighborhood polygon (see genericFollowup.ts +
// followupSources.ts, and project-docs/data-sources-by-msa.md
// "Follow-up — verification notes").
//
// Markets still without a follow-up source (i.e. `followupSupported: false`
// in markets.ts) return `not_available` with the market's note explaining
// why — today that's Austin only (no neighborhood boundary layer + Texas
// non-disclosure means no sale date for hold-time scoring).
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

  if (market === 'denver') return fetchDenverFollowup(opts);
  return fetchGenericFollowup(market, opts);
}
