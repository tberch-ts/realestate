import { useEffect, useState } from 'react';
import type { MarketConfig, MarketKey } from '@mfa/shared';
import { fetchMarkets } from './api';

const STORAGE_KEY = 'mfa.selectedMarket';
export const DEFAULT_MARKET: MarketKey = 'denver';

// Fetches the market registry (with per-feature *Supported flags) so
// pages can gate their market picker off real capability instead of
// guessing. See apps/api/src/routes/markets.ts.
export function useMarkets(): { markets: MarketConfig[]; loading: boolean; error: string | null } {
  const [markets, setMarkets] = useState<MarketConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarkets()
      .then((m) => !cancelled && setMarkets(m))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { markets, loading, error };
}

// Reads/writes the last-picked market from localStorage so it persists
// across page navigations within a session. Defaults to Denver.
export function getStoredMarket(): MarketKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (v as MarketKey) || DEFAULT_MARKET;
  } catch {
    return DEFAULT_MARKET;
  }
}

export function setStoredMarket(market: MarketKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, market);
  } catch {
    // ignore (private browsing / storage disabled)
  }
}
