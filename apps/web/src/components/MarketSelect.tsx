import type { MarketConfig, MarketKey } from '@mfa/shared';
import { useMarkets } from '../lib/markets';

// Shared market picker for Hotspots/Followup/Portfolio. Options for a
// market without the requested capability are shown but disabled (rather
// than hidden) so users understand more markets exist and know why they
// can't pick one yet.
export default function MarketSelect({
  value,
  onChange,
  capability,
  className,
}: {
  value: MarketKey;
  onChange: (market: MarketKey) => void;
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
        'px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-50'
      }
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
