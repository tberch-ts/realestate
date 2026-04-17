import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface RankedZone {
  name: string;
  score: number;
  medianIncome?: number;
  medianRent?: number;
  population?: number;
  rentBurdenedPct?: number;
}

export default function Home() {
  const nav = useNavigate();
  const [address, setAddress] = useState('');
  const [zones, setZones] = useState<RankedZone[] | null>(null);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [zonesLoading, setZonesLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/hotspots/denver/ranked?limit=10`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => setZones(body.data ?? []))
      .catch((e: Error) => setZonesError(e.message))
      .finally(() => setZonesLoading(false));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    nav(`/property?address=${encodeURIComponent(address.trim())}`);
  }

  const hot = (zones ?? []).filter((z) => z.score >= 90);
  const warm = (zones ?? []).filter((z) => z.score >= 80 && z.score < 90);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">MultiFamily Analyzer</h1>
        <p className="text-slate-400 mb-8">
          Denver-focused deal analysis. Enter an address to pull public data, underwrite, and
          generate an LOI.
        </p>

        <form onSubmit={submit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="1234 S Pearl St, Denver, CO"
            className="flex-1 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-400 text-slate-100"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold text-white"
          >
            Analyze
          </button>
        </form>

        <div className="flex gap-4 text-sm text-slate-400 mb-10">
          <Link to="/hotspots" className="hover:text-indigo-300 underline">
            Deal-zone map →
          </Link>
          <Link to="/deals" className="hover:text-indigo-300 underline">
            Saved deals →
          </Link>
          <Link to="/deal" className="hover:text-indigo-300 underline">
            New blank deal →
          </Link>
        </div>

        <HotZoneStrip title="🔥 Hot zones" subtitle="Score 90+" zones={hot} loading={zonesLoading} error={zonesError} accent="emerald" />
        <HotZoneStrip title="🟠 Warm zones" subtitle="Score 80–89" zones={warm} loading={zonesLoading} error={null} accent="amber" />

        {!zonesLoading && !zonesError && hot.length === 0 && warm.length === 0 && zones && (
          <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
            No neighborhoods currently score 80+. First load of the map below takes ~20s while we
            pull Census data for all 78 Denver neighborhoods. Refresh once the map loads to see
            rankings.
          </div>
        )}

        <p className="text-xs text-slate-500 mt-10">
          v0.5 · Phase 5 — deal-zone heat map + market-score split
        </p>
      </div>
    </div>
  );
}

function HotZoneStrip({
  title,
  subtitle,
  zones,
  loading,
  error,
  accent,
}: {
  title: string;
  subtitle: string;
  zones: RankedZone[];
  loading: boolean;
  error: string | null;
  accent: 'emerald' | 'amber';
}) {
  if (loading) {
    return (
      <section className="mb-8">
        <Header title={title} subtitle={subtitle} />
        <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
          Loading Denver neighborhood scores… (first load ~20s while Census data is fetched)
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="mb-8">
        <Header title={title} subtitle={subtitle} />
        <div className="p-4 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
          Could not load zones: {error}
        </div>
      </section>
    );
  }
  if (zones.length === 0) return null;

  const ring = accent === 'emerald' ? 'border-emerald-500/30' : 'border-amber-500/30';
  const scoreClr = accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300';

  return (
    <section className="mb-8">
      <Header title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {zones.map((z) => (
          <Link
            key={z.name}
            to={`/hotspots?focus=${encodeURIComponent(z.name)}`}
            className={`block p-4 rounded-xl border ${ring} bg-slate-900/40 hover:bg-slate-900/80 transition`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="font-semibold text-slate-100 text-sm">{z.name}</div>
              <div className={`text-2xl font-bold ${scoreClr}`}>{z.score}</div>
            </div>
            <dl className="text-xs text-slate-400 space-y-0.5">
              {z.medianIncome != null && (
                <div className="flex justify-between">
                  <dt>HH income</dt>
                  <dd className="text-slate-300">{fmtMoney(z.medianIncome)}</dd>
                </div>
              )}
              {z.medianRent != null && (
                <div className="flex justify-between">
                  <dt>Median rent</dt>
                  <dd className="text-slate-300">{fmtMoney(z.medianRent)}</dd>
                </div>
              )}
              {z.population != null && (
                <div className="flex justify-between">
                  <dt>Population</dt>
                  <dd className="text-slate-300">{z.population.toLocaleString('en-US')}</dd>
                </div>
              )}
            </dl>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <span className="text-xs text-slate-500">{subtitle}</span>
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
