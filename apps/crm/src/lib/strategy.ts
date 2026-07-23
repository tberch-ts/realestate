import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { StrategyKey } from '@mfa/shared';

// Which acquisition strategy the user is working in. Mirrors the
// localStorage pattern in lib/markets.ts (mfa.selectedMarket) — persists
// across navigations, defaults to the original multifamily experience so
// existing users see zero change until they flip the toggle.
const STORAGE_KEY = 'mfa.selectedStrategy';
export const DEFAULT_STRATEGY: StrategyKey = 'multifamily';

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  multifamily: 'Multifamily',
  land: 'Empty Lots',
};

export function getStoredStrategy(): StrategyKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'land' || v === 'multifamily' ? v : DEFAULT_STRATEGY;
  } catch {
    return DEFAULT_STRATEGY;
  }
}

export function setStoredStrategy(strategy: StrategyKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, strategy);
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

interface StrategyContextValue {
  strategy: StrategyKey;
  setStrategy: (s: StrategyKey) => void;
}

const StrategyContext = createContext<StrategyContextValue>({
  strategy: DEFAULT_STRATEGY,
  setStrategy: () => {},
});

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [strategy, setStrategyState] = useState<StrategyKey>(getStoredStrategy);
  const setStrategy = (s: StrategyKey) => {
    setStoredStrategy(s);
    setStrategyState(s);
  };
  return createElement(StrategyContext.Provider, { value: { strategy, setStrategy } }, children);
}

export function useStrategy(): StrategyContextValue {
  return useContext(StrategyContext);
}
