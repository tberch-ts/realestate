import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchMarketsCompare, type MarketCompareRow } from '../lib/api';

type SortKey = 'investability' | 'similarityToDenver' | 'population' | 'medianIncome' | 'medianRent' | 'violentCrimeRate' | 'name';

export default function MarketIntel() {
  const [rows, setRows] = useState<MarketCompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('investability');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function load(force = false) {
    (force ? setRefreshing : setLoading)(true);
    setError(null);
    fetchMarketsCompare({ force })
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    load(false);
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sort];
      const vb = b[sort];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return (Number(va) - Number(vb)) * dir;
    });
  }, [rows, sort, sortDir]);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Market Intel</h1>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        20 metros scored against Denver on size/income/rent similarity and investability (landlord climate, crime,
        affordability). Investability 50 = parity with Denver; higher is better.
      </p>

      {loading && <p className="text-gray-400 text-sm">Loading market data…</p>}
      {error && <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-4">{error}</div>}

      {sorted.length > 0 && (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'var(--border)' }}>
                <Th label="Metro" k="name" current={sort} dir={sortDir} onClick={toggleSort} align="left" />
                <Th label="Investability" k="investability" current={sort} dir={sortDir} onClick={toggleSort} />
                <Th label="Similarity" k="similarityToDenver" current={sort} dir={sortDir} onClick={toggleSort} />
                <Th label="Population" k="population" current={sort} dir={sortDir} onClick={toggleSort} />
                <Th label="Median income" k="medianIncome" current={sort} dir={sortDir} onClick={toggleSort} />
                <Th label="Median rent" k="medianRent" current={sort} dir={sortDir} onClick={toggleSort} />
                <Th label="Violent crime /100k" k="violentCrimeRate" current={sort} dir={sortDir} onClick={toggleSort} />
                <th className="py-2 px-3 font-medium text-left">Landlord climate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <Row key={r.name} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ r }: { r: MarketCompareRow }) {
  const isDenver = r.name === 'Denver';
  return (
    <tr
      className="border-t hover:bg-white/5 transition-colors"
      style={{ borderColor: 'var(--border)', background: isDenver ? 'rgba(59,130,246,0.06)' : undefined }}
    >
      <td className="py-2 px-3 align-top">
        <span className={isDenver ? 'font-semibold text-blue-300' : 'text-gray-100'}>{r.name}</span>
        <span className="text-xs text-gray-500 ml-1.5">{r.state}</span>
        {isDenver && <span className="text-[10px] text-blue-400 ml-1.5">(baseline)</span>}
        {r.errors && r.errors.length > 0 && (
          <div className="text-[10px] text-amber-400/80 mt-0.5" title={r.errors.join('; ')}>
            partial data
          </div>
        )}
      </td>
      <td className="py-2 px-3 text-right align-top">
        {r.investability != null ? <span className={`font-bold ${scoreColor(r.investability)}`}>{r.investability}</span> : '—'}
      </td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{r.similarityToDenver ?? '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{r.population ? r.population.toLocaleString() : '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{r.medianIncome ? fmtMoney(r.medianIncome) : '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{r.medianRent ? fmtMoney(r.medianRent) : '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">
        {r.violentCrimeRate ?? '—'}
        {r.crimeYear && <div className="text-[10px] text-gray-500">{r.crimeYear}</div>}
      </td>
      <td className="py-2 px-3 align-top">
        <LandlordBadge tier={r.landlordTier} score={r.landlordScore} />
      </td>
    </tr>
  );
}

function LandlordBadge({ tier, score }: { tier: MarketCompareRow['landlordTier']; score: number }) {
  const cls =
    tier === 'friendly'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : tier === 'moderate'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {tier} · {score}
    </span>
  );
}

function Th({
  label,
  k,
  current,
  dir,
  onClick,
  align = 'right',
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = current === k;
  return (
    <th
      className={`py-2 px-3 font-medium cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-gray-200' : ''}`}
      onClick={() => onClick(k)}
    >
      {label}
      {active && <span className="ml-1 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-300';
  if (score >= 55) return 'text-lime-300';
  if (score >= 45) return 'text-amber-200';
  if (score >= 30) return 'text-orange-300';
  return 'text-rose-300';
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
