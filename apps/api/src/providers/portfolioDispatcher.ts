import type { MarketKey, OwnerCluster, ProviderResult } from '@mfa/shared';
import { getMarket } from '../config/markets.js';
import { fetchDenverOwners, fetchDenverPortfolio, fetchOwnerPortfolio } from './denverPortfolio.js';

// Routes ownership-rollup requests to the right per-market provider. Same
// shape as assessorDispatcher.ts / followupDispatcher.ts. Today only
// Denver has a real provider — see markets.ts `portfolioSupported` and
// project-docs/data-sources-by-msa.md for why the others aren't lit up
// yet (bulk parcel data with a usable unit-count field, currently
// confirmed unavailable for every non-Denver market we checked).
function notAvailable<T>(provider: string, market: MarketKey): ProviderResult<T> {
  const cfg = getMarket(market);
  return {
    provider,
    status: 'not_available',
    message: cfg
      ? cfg.notes
        ? `Portfolio isn't available for ${cfg.label} yet — ${cfg.notes}`
        : `Portfolio isn't available for ${cfg.label} yet.`
      : `Unknown market '${market}'`,
  };
}

export async function fetchPortfolio(
  market: MarketKey,
  opts: { minUnits?: number; minYear?: number } = {}
): Promise<ProviderResult<{ rows: OwnerCluster['properties']; fetchedAt: string }>> {
  const cfg = getMarket(market);
  if (!cfg?.portfolioSupported) return notAvailable('portfolio', market);
  switch (market) {
    case 'denver':
      return fetchDenverPortfolio(opts);
    default:
      return notAvailable('portfolio', market);
  }
}

export async function fetchOwners(
  market: MarketKey,
  opts: { minUnits?: number; minYear?: number; outOfStateOnly?: boolean; search?: string; limit?: number } = {}
): Promise<ProviderResult<{ clusters: OwnerCluster[] }>> {
  const cfg = getMarket(market);
  if (!cfg?.portfolioSupported) return notAvailable('portfolio_owners', market);
  switch (market) {
    case 'denver':
      return fetchDenverOwners(opts);
    default:
      return notAvailable('portfolio_owners', market);
  }
}

export async function fetchOwner(
  market: MarketKey,
  owner: string,
  opts: { minUnits?: number; minYear?: number } = {}
): Promise<ProviderResult<OwnerCluster | null>> {
  const cfg = getMarket(market);
  if (!cfg?.portfolioSupported) return notAvailable('portfolio_owner', market);
  switch (market) {
    case 'denver':
      return fetchOwnerPortfolio(owner, opts);
    default:
      return notAvailable('portfolio_owner', market);
  }
}
