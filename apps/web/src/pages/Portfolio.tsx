import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MarketKey, OwnerCluster } from '@mfa/shared';
import { fetchOwners } from '../lib/api';
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets';
import MarketSelect from '../components/MarketSelect';

export default function Portfolio() {
  const [params] = useSearchParams();
  const { markets } = useMarkets();
  const [market, setMarket] = useState<MarketKey>((params.get('market') as MarketKey) || getStoredMarket());
  const cfg = markets.find((m) => m.key === market);
  const [outOfState, setOutOfState] = useState(params.get('oos') === '1');
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<OwnerCluster[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onMarketChange(next: MarketKey) {
    setMarket(next);
    setStoredMarket(next);
    setOwners(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOwners(market, { outOfState, search: search || undefined, limit: 100 })
      .then((c) => {
        if (!cancelled) setOwners(c);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [market, outOfState, search]);

  const totalUnits = owners?.reduce((s, c) => s + c.totalUnits, 0) ?? 0;
  const totalProps = owners?.reduce((s, c) => s + c.propertyCount, 0) ?? 0;

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Home
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3 mt-2">
          <h1 className="text-2xl font-bold">{cfg?.label ?? 'Market'} ownership clusters</h1>
          <MarketSelect value={market} onChange={onMarketChange} capability="portfolioSupported" />
        </div>
        <p className="text-slate-400 text-sm">
          All {cfg?.label ?? 'this market'} 100+ unit multifamily built 1990+, grouped by owner.
          Click a name to see the full portfolio{market === 'denver' ? ' and pull Colorado SOS data' : ''}.
        </p>

        <div className="flex flex-wrap gap-3 mt-5 mb-4 items-end">
          <Filter label="Search owner">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. LOWRY, BLACKSTONE"
              className={INPUT}
            />
          </Filter>
          <label className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
            outOfState ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' : 'bg-slate-900/40 border-slate-700 text-slate-400'
          }`}>
            <input
              type="checkbox"
              checked={outOfState}
              onChange={(e) => setOutOfState(e.target.checked)}
              className="accent-amber-500"
            />
            <span className="text-sm">Out-of-state owners only</span>
          </label>
          {owners && (
            <div className="text-sm text-slate-400 ml-auto">
              {owners.length} owners · {totalProps} props · {totalUnits.toLocaleString()} units
            </div>
          )}
        </div>

        {loading && <p className="text-slate-400">Loading ownership data…</p>}
        {error && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {owners && owners.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                  <th className="py-2 px-3 font-medium text-left">Owner</th>
                  <th className="py-2 px-3 font-medium text-right">Props</th>
                  <th className="py-2 px-3 font-medium text-right">Total units</th>
                  <th className="py-2 px-3 font-medium text-right">Avg year</th>
                  <th className="py-2 px-3 font-medium text-right">Type</th>
                  <th className="py-2 px-3 font-medium text-right">Mailing</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <OwnerRow key={o.owner} o={o} market={market} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OwnerRow({ o, market }: { o: OwnerCluster; market: MarketKey }) {
  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30">
      <td className="py-2 px-3 align-top">
        <Link
          to={`/owner?name=${encodeURIComponent(o.owner)}&market=${market}`}
          className="text-slate-100 hover:text-indigo-300"
        >
          {o.owner}
        </Link>
      </td>
      <td className="py-2 px-3 text-right text-slate-200 align-top">{o.propertyCount}</td>
      <td className="py-2 px-3 text-right text-slate-200 align-top font-semibold">
        {o.totalUnits.toLocaleString()}
      </td>
      <td className="py-2 px-3 text-right text-slate-300 align-top">
        {o.avgYearBuilt ?? '—'}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <OwnerTypeBadge type={o.ownerType} />
      </td>
      <td className="py-2 px-3 text-right align-top">
        {o.outOfState ? (
          <span className="text-amber-300">OOS: {o.mailingState}</span>
        ) : (
          <span className="text-slate-400">{o.mailingState ?? '—'}</span>
        )}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <Link
          to={`/owner?name=${encodeURIComponent(o.owner)}&market=${market}`}
          className="text-indigo-400 hover:text-indigo-300 text-xs"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}

function OwnerTypeBadge({ type }: { type: OwnerCluster['ownerType'] }) {
  const CLS: Record<OwnerCluster['ownerType'], string> = {
    individual: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    llc: 'border-lime-500/40 bg-lime-500/10 text-lime-200',
    institutional: 'border-slate-600 bg-slate-700/40 text-slate-300',
    unknown: 'border-slate-600 bg-slate-800/60 text-slate-400',
  };
  const LABEL: Record<OwnerCluster['ownerType'], string> = {
    individual: 'Indiv',
    llc: 'LLC',
    institutional: 'Inst',
    unknown: '?',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CLS[type]}`}>
      {LABEL[type]}
    </span>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-xs text-slate-400">
      <span className="mb-1">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  'px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 w-56 focus:outline-none focus:border-indigo-400';
