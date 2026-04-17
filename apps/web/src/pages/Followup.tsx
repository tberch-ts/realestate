import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FollowupResult, FollowupScored } from '@mfa/shared';
import { fetchFollowup } from '../lib/api';

type SortKey = 'score' | 'units' | 'yearBuilt' | 'yearsHeld' | 'salePrice' | 'owner';

export default function Followup() {
  const [params] = useSearchParams();
  const zone = params.get('zone') ?? '';
  const [minUnits, setMinUnits] = useState<number>(100);
  const [minYear, setMinYear] = useState<number>(1990);
  const [result, setResult] = useState<FollowupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!zone) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFollowup(zone, { minUnits, minYear, limit: 200 })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zone, minUnits, minYear]);

  const rows = useMemo(() => {
    if (!result) return [];
    const sorted = [...result.candidates].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = extractSortKey(a, sort);
      const vb = extractSortKey(b, sort);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return (Number(va) - Number(vb)) * dir;
    });
    return sorted;
  }, [result, sort, sortDir]);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      setSortDir(key === 'owner' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link to="/hotspots" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Map
          </Link>
          <h1 className="text-2xl font-bold mt-2">{zone || 'Follow-up candidates'}</h1>
          <p className="text-slate-400 text-sm">
            Properties matching your buy box in this zone, ranked by follow-up priority (long-hold,
            non-institutional, out-of-state owners first).
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <Filter label="Min units">
            <input
              type="number"
              value={minUnits}
              onChange={(e) => setMinUnits(Number(e.target.value) || 0)}
              className={INPUT}
            />
          </Filter>
          <Filter label="Min year built">
            <input
              type="number"
              value={minYear}
              onChange={(e) => setMinYear(Number(e.target.value) || 0)}
              className={INPUT}
            />
          </Filter>
          {result && (
            <div className="text-sm text-slate-400 ml-auto">
              {result.count} candidate{result.count === 1 ? '' : 's'}
            </div>
          )}
        </div>

        {loading && <p className="text-slate-400">Querying Denver parcels…</p>}
        {error && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                  <Th label="Score" k="score" current={sort} dir={sortDir} onClick={toggleSort} />
                  <Th label="Address" k="owner" current={sort} dir={sortDir} onClick={toggleSort} align="left" />
                  <Th label="Owner" k="owner" current={sort} dir={sortDir} onClick={toggleSort} align="left" />
                  <Th label="Units" k="units" current={sort} dir={sortDir} onClick={toggleSort} />
                  <Th label="Built" k="yearBuilt" current={sort} dir={sortDir} onClick={toggleSort} />
                  <Th label="Yrs held" k="yearsHeld" current={sort} dir={sortDir} onClick={toggleSort} />
                  <Th label="Last sale" k="salePrice" current={sort} dir={sortDir} onClick={toggleSort} />
                  <th className="py-2 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Row key={c.parcelId ?? c.address} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && rows.length === 0 && !loading && (
          <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
            No candidates in this zone with units ≥ {minUnits} and year built ≥ {minYear}. Try
            loosening the filters.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ c }: { c: FollowupScored }) {
  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30">
      <td className="py-2 px-3 align-top">
        <span className={`text-lg font-bold ${scoreColor(c.score)}`}>{c.score}</span>
      </td>
      <td className="py-2 px-3 align-top">
        <Link
          to={`/property?address=${encodeURIComponent(c.address + ', Denver, CO')}`}
          className="text-slate-100 hover:text-indigo-300"
        >
          {c.address}
        </Link>
        {c.reasons.length > 0 && (
          <div className="text-xs text-slate-500 italic mt-0.5">{c.reasons.join(' · ')}</div>
        )}
      </td>
      <td className="py-2 px-3 text-slate-300 align-top">
        <div>{c.owner ?? '—'}</div>
        <OwnerBadge ownerType={c.signals.ownerType} outOfState={c.signals.outOfStateOwner} state={c.ownerMailingState} />
      </td>
      <td className="py-2 px-3 text-right text-slate-200 align-top">{c.units ?? '—'}</td>
      <td className="py-2 px-3 text-right text-slate-300 align-top">{c.yearBuilt ?? '—'}</td>
      <td className="py-2 px-3 text-right text-slate-300 align-top">
        {c.signals.yearsHeld != null ? `${c.signals.yearsHeld}y` : '—'}
      </td>
      <td className="py-2 px-3 text-right text-slate-300 align-top">
        {c.salePrice ? fmtMoney(c.salePrice) : '—'}
        {c.saleDate && <div className="text-xs text-slate-500">{c.saleDate}</div>}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <Link
          to={`/property?address=${encodeURIComponent(c.address + ', Denver, CO')}`}
          className="text-indigo-400 hover:text-indigo-300 text-xs"
        >
          Analyze →
        </Link>
      </td>
    </tr>
  );
}

function OwnerBadge({
  ownerType,
  outOfState,
  state,
}: {
  ownerType: FollowupScored['signals']['ownerType'];
  outOfState?: boolean;
  state?: string;
}) {
  const tier = OWNER_TIERS[ownerType];
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tier.cls}`}>{tier.label}</span>
      {outOfState && state && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200">
          OOS: {state}
        </span>
      )}
    </div>
  );
}

const OWNER_TIERS: Record<FollowupScored['signals']['ownerType'], { label: string; cls: string }> = {
  individual: { label: 'Individual/Trust', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  llc: { label: 'Small LLC', cls: 'border-lime-500/40 bg-lime-500/10 text-lime-200' },
  institutional: { label: 'Institutional', cls: 'border-slate-600 bg-slate-700/40 text-slate-300' },
  unknown: { label: 'Unknown', cls: 'border-slate-600 bg-slate-800/60 text-slate-400' },
};

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
      className={`py-2 px-3 font-medium cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-slate-200' : ''}`}
      onClick={() => onClick(k)}
    >
      {label}
      {active && <span className="ml-1 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
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

function extractSortKey(c: FollowupScored, k: SortKey): string | number | undefined {
  switch (k) {
    case 'score': return c.score;
    case 'units': return c.units;
    case 'yearBuilt': return c.yearBuilt;
    case 'yearsHeld': return c.signals.yearsHeld;
    case 'salePrice': return c.salePrice;
    case 'owner': return c.owner?.toLowerCase();
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-300';
  if (score >= 80) return 'text-lime-300';
  if (score >= 60) return 'text-amber-200';
  if (score >= 40) return 'text-orange-300';
  return 'text-slate-400';
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const INPUT =
  'px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 w-24 focus:outline-none focus:border-indigo-400';
