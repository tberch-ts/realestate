import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ExternalLink, MapPin, Mail, Package, Search, BadgeCheck } from 'lucide-react';
import type { BuilderDetail, BuilderRecord, MarketKey } from '@mfa/shared';
import { fetchBuilders, fetchBuilderDetail } from '../lib/api';
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets';
import MarketSelect from '../components/MarketSelect';

// Builder discovery ("Builder Buy Boxes" search): find the developers behind
// the activity the Saturation Map shows — business-entity owners of recent
// new construction + bought vacant lots, scored on build volume + the
// Saturation score of the ZIPs they build in. Fed by
// GET /api/land/:market/builders (+ /:name for lazy contact enrichment).

interface Filters {
  minHomesBuilt: string;
  minScore: string;
  zips: string;
}

export default function BuilderSearch() {
  const { markets } = useMarkets();
  const navigate = useNavigate();
  const [market, setMarket] = useState<MarketKey>(getStoredMarket());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [builders, setBuilders] = useState<BuilderRecord[]>([]);
  const [filters, setFilters] = useState<Filters>({ minHomesBuilt: '', minScore: '', zips: '' });
  // Applied filters that actually drive the fetch (Apply button commits them).
  const [applied, setApplied] = useState<Filters>({ minHomesBuilt: '', minScore: '', zips: '' });

  const cfg = markets.find((m) => m.key === market);

  // If the stored market doesn't support land, hop to the first that does.
  useEffect(() => {
    if (!markets.length) return;
    const cur = markets.find((m) => m.key === market);
    if (cur && !cur.landSupported) {
      const firstLand = markets.find((m) => m.landSupported);
      if (firstLand) setMarket(firstLand.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets]);

  function onMarketChange(next: MarketKey) {
    setMarket(next);
    setStoredMarket(next);
  }

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetchBuilders(market, {
      minHomesBuilt: applied.minHomesBuilt ? Number(applied.minHomesBuilt) : undefined,
      minScore: applied.minScore ? Number(applied.minScore) : undefined,
      zips: applied.zips ? applied.zips.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setBuilders(res.builders);
        setStatus('ready');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [market, applied]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setApplied({ ...filters });
  }

  function saveAsBuyBox(b: BuilderRecord) {
    navigate('/app/land/buy-boxes', {
      state: {
        prefillBuilder: {
          builderName: b.name,
          market,
          areaLabel: cfg ? cfg.label : undefined,
          zips: b.zips.slice(0, 8),
        },
      },
    });
  }

  const landSupported = cfg?.landSupported ?? false;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Find Builders</h1>
          <p className="text-gray-500 text-sm max-w-2xl">
            Developers actively building in this market, ranked by how much they build and how hot the
            ZIPs they build in are. Expand a builder for contact info, then save them as a Buy Box.
          </p>
        </div>
        <MarketSelect value={market} onChange={onMarketChange} capability="landSupported" />
      </div>

      {/* Filter bar */}
      <form onSubmit={apply} className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <Field label="Min homes built (2 yr)">
          <input
            type="number"
            min={0}
            value={filters.minHomesBuilt}
            onChange={(e) => setFilters((f) => ({ ...f, minHomesBuilt: e.target.value }))}
            placeholder="5"
            className="w-28 rounded-lg border px-2.5 py-1.5 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label="Min score">
          <input
            type="number"
            min={0}
            max={100}
            value={filters.minScore}
            onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
            placeholder="50"
            className="w-24 rounded-lg border px-2.5 py-1.5 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label="ZIP codes (comma-separated)">
          <input
            value={filters.zips}
            onChange={(e) => setFilters((f) => ({ ...f, zips: e.target.value }))}
            placeholder="33598, 33572"
            className="w-48 rounded-lg border px-2.5 py-1.5 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <button
          type="submit"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Search size={14} /> Search
        </button>
      </form>

      {status === 'error' && error && (
        <div className="mb-3 p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>
      )}

      {status === 'loading' && (
        <div className="p-4 rounded-xl border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          Scoring builders from county parcel records (first load can take a minute; then served from a 24h cache)…
        </div>
      )}

      {status === 'ready' && !landSupported && (
        <EmptyState>Builder search isn't available for this market yet.</EmptyState>
      )}

      {status === 'ready' && landSupported && builders.length === 0 && (
        <EmptyState>No builders matched. Try lowering the filters.</EmptyState>
      )}

      {status === 'ready' && builders.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs text-gray-500">{builders.length} builders</p>
          {builders.map((b) => (
            <BuilderCard key={b.name} market={market} builder={b} onSave={() => saveAsBuyBox(b)} />
          ))}
          <p className="text-[11px] text-gray-600 pt-2">
            Builder identity is inferred from current parcel ownership — verify before outreach. Contact
            data comes from county mailing records + Secretary-of-State filings.
          </p>
        </div>
      )}
    </div>
  );
}

function BuilderCard({ market, builder, onSave }: { market: MarketKey; builder: BuilderRecord; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<BuilderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setErr(null);
      fetchBuilderDetail(market, builder.name)
        .then(setDetail)
        .catch((e: Error) => setErr(e.message))
        .finally(() => setLoading(false));
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={toggle}>
        <ScoreBadge score={builder.score} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5 truncate">
            <Building2 size={14} className="text-gray-500 shrink-0" />
            <span className="truncate">{builder.name}</span>
            {builder.isKnownBuilder && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-300 bg-emerald-500/10 rounded px-1 py-0.5 shrink-0">
                <BadgeCheck size={10} /> builder
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            <span><span className="text-gray-300">{builder.homesBuilt24mo}</span> built (2yr)</span>
            {builder.lotsAcquired12mo > 0 && <span><span className="text-gray-300">{builder.lotsAcquired12mo}</span> lots (12mo)</span>}
            <span className="flex items-center gap-1"><MapPin size={11} /> {builder.zips.length} ZIP{builder.zips.length === 1 ? '' : 's'}{builder.topZip ? ` · top ${builder.topZip}` : ''}</span>
            <span>saturation {builder.avgZipSaturation}</span>
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSave(); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border text-gray-200 hover:bg-white/5 transition-colors shrink-0"
          style={{ borderColor: 'var(--border)' }}
          title="Save as a Builder Buy Box"
        >
          <Package size={13} /> Save as Buy Box
        </button>
      </div>

      {open && (
        <div className="border-t px-4 py-3 text-sm" style={{ borderColor: 'var(--border)' }}>
          {loading && <p className="text-gray-500 text-xs">Looking up contact info…</p>}
          {err && <p className="text-rose-300 text-xs">{err}</p>}
          {detail && <ContactBlock detail={detail} />}
        </div>
      )}
    </div>
  );
}

function ContactBlock({ detail }: { detail: BuilderDetail }) {
  const c = detail.contact;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1"><Mail size={11} /> Mailing address</p>
          <p className="text-gray-200 text-xs">{c.mailingAddress ?? '—'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Secretary of State</p>
          {c.sosStatus === 'ok' ? (
            <div className="text-xs text-gray-200 space-y-0.5">
              {c.entityName && <p>{c.entityName}</p>}
              {c.registeredAgent?.name && <p className="text-gray-400">Agent: {c.registeredAgent.name}</p>}
              {c.registeredAgent?.address && <p className="text-gray-500">{c.registeredAgent.address}</p>}
              {c.principalAddress && <p className="text-gray-500">Principal: {c.principalAddress}</p>}
              {c.sosProfileUrl && (
                <a href={c.sosProfileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  SoS record <ExternalLink size={10} />
                </a>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              <p>{c.message ?? 'No registered-agent lookup for this state.'}</p>
              {c.sosPortalUrl && (
                <a href={c.sosPortalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 mt-0.5">
                  Search the state portal <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {detail.sampleParcels.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Sample parcels</p>
          <ul className="text-xs text-gray-400 space-y-0.5">
            {detail.sampleParcels.slice(0, 6).map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`text-[10px] rounded px-1 ${p.kind === 'newBuild' ? 'bg-blue-500/10 text-blue-300' : 'bg-amber-500/10 text-amber-300'}`}>
                  {p.kind === 'newBuild' ? 'built' : 'lot'}
                </span>
                <span className="truncate">{p.address ?? p.parcelId ?? '—'}{p.zip ? ` · ${p.zip}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
      style={{ background: colorForScore(score), color: score >= 20 ? '#0f172a' : '#e5e7eb' }}
    >
      {score}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border text-gray-500 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      {children}
    </div>
  );
}

function colorForScore(score: number): string {
  if (score >= 80) return '#dc2626';
  if (score >= 60) return '#ea580c';
  if (score >= 40) return '#b45309';
  if (score >= 20) return '#7c5b12';
  return '#334155';
}
