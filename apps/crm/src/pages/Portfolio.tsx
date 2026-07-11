import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OwnerCluster } from '@mfa/shared';
import { fetchOwners } from '../lib/api';

export default function Portfolio() {
  const [params] = useSearchParams();
  const [outOfState, setOutOfState] = useState(params.get('oos') === '1');
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<OwnerCluster[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOwners({ outOfState, search: search || undefined, limit: 100 })
      .then((c) => {
        if (!cancelled) setOwners(c);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [outOfState, search]);

  const totalUnits = owners?.reduce((s, c) => s + c.totalUnits, 0) ?? 0;
  const totalProps = owners?.reduce((s, c) => s + c.propertyCount, 0) ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Denver ownership clusters</h1>
      <p className="text-sm text-gray-500 mb-6">
        All Denver 100+ unit multifamily built 1990+, grouped by owner. Click a name to see the
        full portfolio and pull Colorado SOS data.
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <Filter label="Search owner">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. LOWRY, BLACKSTONE"
            className="rounded-lg border px-3 py-1.5 text-sm bg-transparent w-56"
            style={{ borderColor: 'var(--border)' }}
          />
        </Filter>
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
            outOfState ? 'text-amber-200' : 'text-gray-400'
          }`}
          style={{ borderColor: outOfState ? 'rgba(245,158,11,0.4)' : 'var(--border)', background: outOfState ? 'rgba(245,158,11,0.1)' : undefined }}
        >
          <input type="checkbox" checked={outOfState} onChange={(e) => setOutOfState(e.target.checked)} />
          Out-of-state owners only
        </label>
        {owners && (
          <div className="text-sm text-gray-500 ml-auto">
            {owners.length} owners · {totalProps} props · {totalUnits.toLocaleString()} units
          </div>
        )}
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading ownership data…</p>}
      {error && (
        <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>
      )}

      {owners && owners.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'var(--border)' }}>
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
                <OwnerRow key={o.owner} o={o} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OwnerRow({ o }: { o: OwnerCluster }) {
  return (
    <tr className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
      <td className="py-2 px-3 align-top">
        <Link to={`/app/owner?name=${encodeURIComponent(o.owner)}`} className="text-gray-100 hover:text-blue-300">
          {o.owner}
        </Link>
      </td>
      <td className="py-2 px-3 text-right text-gray-200 align-top">{o.propertyCount}</td>
      <td className="py-2 px-3 text-right text-gray-200 align-top font-semibold">{o.totalUnits.toLocaleString()}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{o.avgYearBuilt ?? '—'}</td>
      <td className="py-2 px-3 text-right align-top">
        <OwnerTypeBadge type={o.ownerType} />
      </td>
      <td className="py-2 px-3 text-right align-top">
        {o.outOfState ? <span className="text-amber-300">OOS: {o.mailingState}</span> : <span className="text-gray-400">{o.mailingState ?? '—'}</span>}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <Link to={`/app/owner?name=${encodeURIComponent(o.owner)}`} className="text-blue-400 hover:text-blue-300 text-xs">
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
    institutional: 'border-gray-600 bg-gray-700/40 text-gray-300',
    unknown: 'border-gray-600 bg-gray-800/60 text-gray-400',
  };
  const LABEL: Record<OwnerCluster['ownerType'], string> = {
    individual: 'Indiv',
    llc: 'LLC',
    institutional: 'Inst',
    unknown: '?',
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CLS[type]}`}>{LABEL[type]}</span>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-xs text-gray-500">
      <span className="mb-1">{label}</span>
      {children}
    </label>
  );
}
