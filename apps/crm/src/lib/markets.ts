import { useEffect, useState } from 'react';
import type { MarketConfig, MarketKey } from '@mfa/shared';
import { apiFetch } from './api';
import { API_URL as BASE } from './runtimeEnv';

const STORAGE_KEY = 'mfa.selectedMarket';
export const DEFAULT_MARKET: MarketKey = 'denver';

// Module-level cache so every page sharing this hook doesn't re-fetch
// `/api/markets` on every mount — the list barely ever changes and is
// already HTTP-cached for an hour server-side (see routes/markets.ts).
let cached: MarketConfig[] | null = null;
let inflight: Promise<MarketConfig[]> | null = null;

async function loadMarkets(): Promise<MarketConfig[]> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await apiFetch(`${BASE}/api/markets`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = await res.json();
    cached = body.data.markets as MarketConfig[];
    return cached;
  })();
  return inflight;
}

// Fetches the full market registry (with per-feature *Supported flags) so
// pages can gate their market picker off real capability instead of
// guessing. See apps/api/src/routes/markets.ts.
export function useMarkets(): { markets: MarketConfig[]; loading: boolean; error: string | null } {
  const [markets, setMarkets] = useState<MarketConfig[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    loadMarkets()
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
// across page navigations within a session (Hotspots -> Followup ->
// Owner all need to agree on the same market). Defaults to Denver.
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
