import type { MarketConfig, MarketKey } from '@mfa/shared';
import { useMarkets } from '../lib/markets';

// Shared market picker for Hotspots/Followup/Portfolio. Options for a
// market without the requested capability are shown but disabled (rather
// than hidden) so users understand more markets exist and know why they
// can't pick one yet — mirrors the *Supported gating already used for
// the assessor-only markets in PropertySearch.
export default function MarketSelect({
  value,
  onChange,
  capability,
  className,
}: {
  value: MarketKey;
  onChange: (market: MarketKey) => void;
  /** Which *Supported flag gates enabling an option. */
  capability: 'neighborhoodsSupported' | 'followupSupported' | 'portfolioSupported';
  className?: string;
}) {
  const { markets, loading } = useMarkets();

  return (
    <select
      value={value}
      disabled={loading}
      onChange={(e) => onChange(e.target.value as MarketKey)}
      className={
        className ??
        'rounded-lg border px-3 py-1.5 text-sm bg-transparent disabled:opacity-50'
      }
      style={{ borderColor: 'var(--border)' }}
      title={loading ? 'Loading markets…' : undefined}
    >
      {markets.map((m: MarketConfig) => (
        <option key={m.key} value={m.key} disabled={!m[capability]}>
          {m.label}
          {!m[capability] ? ' (coming soon)' : ''}
        </option>
      ))}
    </select>
  );
}
