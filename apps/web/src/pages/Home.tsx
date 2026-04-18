import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LoiDraft } from '@mfa/shared';
import { apiFetch, deleteDraft, listDrafts, listFollowUps, patchFollowUp, type FollowUp } from '../lib/api';
import { API_URL as API_BASE } from '../lib/runtimeEnv';
import { getDevMode, toggleDevMode, onDevModeChange } from '../lib/devMode';

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
  const [drafts, setDrafts] = useState<LoiDraft[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[] | null>(null);
  const [devMode, setDevModeState] = useState<boolean>(() => getDevMode());

  useEffect(() => {
    apiFetch(`${API_BASE}/api/hotspots/denver/ranked?limit=10`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => setZones(body.data ?? []))
      .catch((e: Error) => setZonesError(e.message))
      .finally(() => setZonesLoading(false));

    // LOI drafts — best-effort. If Postgres is down, just show nothing.
    listDrafts('draft').then(setDrafts).catch(() => setDrafts([]));
    // Follow-ups (next 14 days) — best-effort.
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14);
    listFollowUps({ status: 'open', dueBefore: cutoff.toISOString().slice(0, 10), limit: 10 })
      .then(setFollowUps).catch(() => setFollowUps([]));
  }, []);

  useEffect(() => onDevModeChange(setDevModeState), []);

  async function markFollowUpDone(id: number) {
    try {
      await patchFollowUp(id, { status: 'done' });
      setFollowUps((prev) => (prev ?? []).filter((f) => f.id !== id));
    } catch { /* silent */ }
  }

  async function handleDeleteDraft(id: number) {
    if (!confirm('Delete this LOI draft?')) return;
    try {
      await deleteDraft(id);
      setDrafts((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch {
      // silent — optimistic UX
    }
  }

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

        <div className="flex gap-4 text-sm text-slate-400 mb-10 flex-wrap">
          <Link to="/hotspots" className="hover:text-indigo-300 underline">
            Deal-zone map →
          </Link>
          <Link to="/portfolio" className="hover:text-indigo-300 underline">
            Owners →
          </Link>
          <Link to="/portfolio?oos=1" className="hover:text-indigo-300 underline">
            Out-of-state owners →
          </Link>
          <Link to="/deals" className="hover:text-indigo-300 underline">
            Saved deals →
          </Link>
          <Link to="/deal" className="hover:text-indigo-300 underline">
            New blank deal →
          </Link>
          <Link to="/contacts" className="hover:text-indigo-300 underline">
            Contacts →
          </Link>
          <Link to="/filings" className="hover:text-indigo-300 underline">
            SEC Form D →
          </Link>
          <Link to="/settings" className="hover:text-indigo-300 underline">
            Settings →
          </Link>
          <button
            onClick={() => { const next = toggleDevMode(); setDevModeState(next); }}
            title="Ctrl+Alt+D toggles. Test credentials on, no real mail / real charges."
            className={`text-xs border rounded px-2 py-0.5 ${devMode
              ? 'bg-amber-600 border-amber-400 text-amber-50'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
          >
            {devMode ? '⚠ DEV' : 'LIVE'}
          </button>
        </div>

        {followUps && followUps.length > 0 && (
          <section className="mb-8 bg-slate-900 border border-slate-800 rounded p-5">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-lg font-semibold">Upcoming follow-ups</h2>
              <span className="text-xs text-slate-500">next 14 days · {followUps.length} open</span>
            </div>
            <ul className="divide-y divide-slate-800">
              {followUps.map((f) => (
                <li key={f.id} className="py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => markFollowUpDone(f.id)}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-slate-500 w-24">{f.dueDate}</span>
                  <Link to={`/contact/${f.contactId}`} className="text-sm text-slate-300 hover:underline w-64 truncate">
                    {f.contactName ?? 'Contact'}
                  </Link>
                  <span className="text-sm text-slate-400 flex-1 truncate">{f.subject}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {drafts && drafts.length > 0 && (
          <section className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-lg font-semibold text-slate-100">📝 LOI drafts</h2>
              <span className="text-xs text-slate-500">
                Resume where you left off — {drafts.length}{' '}
                {drafts.length === 1 ? 'draft' : 'drafts'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {drafts.slice(0, 6).map((d) => (
                <DraftCard key={d.id} draft={d} onDelete={handleDeleteDraft} />
              ))}
            </div>
          </section>
        )}

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

function DraftCard({
  draft,
  onDelete,
}: {
  draft: LoiDraft;
  onDelete: (id: number) => void;
}) {
  const updated = new Date(draft.updatedAt);
  const ago = relTime(updated);
  const buyer = draft.loi.buyerEntity || <span className="text-slate-500 italic">no buyer yet</span>;
  const price = draft.dealContext.purchasePrice;
  return (
    <div className="p-4 rounded-xl border border-indigo-500/30 bg-slate-900/40 hover:bg-slate-900/80 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/loi?draftId=${draft.id}`} className="block">
            <div className="text-sm font-semibold text-slate-100 truncate" title={draft.address}>
              {draft.address}
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">Buyer: {buyer}</div>
          </Link>
        </div>
        {price != null && price > 0 && (
          <div className="text-sm text-slate-300 whitespace-nowrap">
            {price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-slate-500">Saved {ago}</div>
        <div className="flex gap-3 text-xs">
          <Link
            to={`/loi?draftId=${draft.id}`}
            className="text-indigo-400 hover:text-indigo-300"
          >
            Continue →
          </Link>
          <button
            onClick={() => onDelete(draft.id)}
            className="text-slate-500 hover:text-rose-400"
            aria-label="Delete draft"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

function relTime(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
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
