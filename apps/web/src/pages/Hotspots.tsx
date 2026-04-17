import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FollowupResult, FollowupScored } from '@mfa/shared';
import { fetchFollowup } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { API_URL as API_BASE, GOOGLE_MAPS_API_KEY as MAPS_KEY } from '../lib/runtimeEnv';

const DENVER_CENTER = { lat: 39.7392, lng: -104.9903 };

export default function Hotspots() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    name: string;
    score: number;
    medianIncome?: number;
    medianRent?: number;
    population?: number;
    rentBurdenedPct?: number;
  } | null>(null);
  const [followup, setFollowup] = useState<FollowupResult | null>(null);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!MAPS_KEY) {
        setError(
          'Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY (dev) or GOOGLE_MAPS_API_KEY on the web container (prod).'
        );
        setStatus('error');
        return;
      }

      try {
        const maps = await loadGoogleMaps(MAPS_KEY);
        if (cancelled || !mapDiv.current) return;

        const map = new maps.Map(mapDiv.current, {
          center: DENVER_CENTER,
          zoom: 11,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: false,
          clickableIcons: false,
        });

        setStatus('ready');

        // Fetch scored GeoJSON
        const res = await fetch(`${API_BASE}/api/hotspots/denver`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const geojson = body.data;

        map.data.addGeoJson(geojson);
        map.data.setStyle((feature: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = feature as any;
          const score = Number(f.getProperty('score') ?? 0);
          return {
            fillColor: colorForScore(score),
            fillOpacity: 0.55,
            strokeColor: '#0f172a',
            strokeWeight: 1,
          };
        });

        map.data.addListener('mouseover', (e: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.data.overrideStyle((e as any).feature, { fillOpacity: 0.8, strokeWeight: 2 });
        });
        map.data.addListener('mouseout', () => map.data.revertStyle());
        map.data.addListener('click', (e: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = (e as any).feature;
          setSelected({
            name: String(f.getProperty('nbhd_name') ?? 'Unknown'),
            score: Number(f.getProperty('score') ?? 0),
            medianIncome: toNum(f.getProperty('medianIncome')),
            medianRent: toNum(f.getProperty('medianRent')),
            population: toNum(f.getProperty('population')),
            rentBurdenedPct: toNum(f.getProperty('rentBurdenedPct')),
          });
        });
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus('error');
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load follow-up candidates when a zone is selected.
  useEffect(() => {
    if (!selected) {
      setFollowup(null);
      setFollowupError(null);
      return;
    }
    let cancelled = false;
    setFollowupLoading(true);
    setFollowupError(null);
    fetchFollowup(selected.name, { limit: 5 })
      .then((r) => {
        if (!cancelled) setFollowup(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setFollowupError(e.message);
      })
      .finally(() => {
        if (!cancelled) setFollowupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.name]);

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
              ← Home
            </Link>
            <h1 className="text-2xl font-bold mt-2">Denver deal zones</h1>
            <p className="text-slate-400 text-sm">
              Neighborhoods scored by market fundamentals (income, rent, population, rent burden).
              Click a zone for details.
            </p>
          </div>
          <Legend />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div
            ref={mapDiv}
            className="h-[70vh] rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
          />

          <aside className="space-y-3">
            {status === 'loading' && (
              <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-slate-300 text-sm">
                Loading map and scoring neighborhoods (first load pulls Census data for ~78
                neighborhoods — takes 15–30s)…
              </div>
            )}
            {error && (
              <div className="p-4 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
                {error}
              </div>
            )}
            {selected && (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-slate-100">{selected.name}</h3>
                  <div
                    className={`text-3xl font-bold ${scoreTextColor(selected.score)}`}
                  >
                    {selected.score}
                  </div>
                </div>
                <dl className="mt-3 text-sm space-y-1">
                  <Row k="Median HH income" v={fmtMoney(selected.medianIncome)} />
                  <Row k="Median gross rent" v={fmtMoney(selected.medianRent)} />
                  <Row k="Population (tract)" v={fmtNum(selected.population)} />
                  <Row k="Rent-burdened 50%+" v={fmtNum(selected.rentBurdenedPct)} />
                </dl>
                <Link
                  to={`/?q=${encodeURIComponent(selected.name + ', Denver, CO')}`}
                  className="mt-4 block text-center px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 font-semibold text-white text-sm"
                >
                  Search an address here →
                </Link>
              </div>
            )}
            {selected && (
              <FollowupPanel
                zone={selected.name}
                loading={followupLoading}
                error={followupError}
                result={followup}
              />
            )}
            {!selected && status === 'ready' && (
              <div className="p-4 rounded border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
                Click a neighborhood polygon to see details.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const tiers: Array<[string, string]> = [
    ['90+ Hot', colorForScore(95)],
    ['80–89 Warm', colorForScore(85)],
    ['60–79 OK', colorForScore(70)],
    ['<60 Cold', colorForScore(50)],
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {tiers.map(([label, color]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded border border-slate-900"
            style={{ backgroundColor: color }}
          />
          <span className="text-slate-400">{label}</span>
        </div>
      ))}
    </div>
  );
}

function FollowupPanel({
  zone,
  loading,
  error,
  result,
}: {
  zone: string;
  loading: boolean;
  error: string | null;
  result: FollowupResult | null;
}) {
  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-100">Follow-up candidates</h4>
        {result && (
          <Link to={`/followup?zone=${encodeURIComponent(zone)}`} className="text-xs text-indigo-400 hover:text-indigo-300">
            See all {result.count} →
          </Link>
        )}
      </div>
      {loading && <p className="text-sm text-slate-400">Querying Denver parcels…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {result && result.count === 0 && (
        <p className="text-sm text-slate-500">
          No 100+ unit, 1990+ buildings in this zone. Try loosening minUnits on the full list.
        </p>
      )}
      {result && result.candidates.length > 0 && (
        <ul className="space-y-2">
          {result.candidates.map((c) => (
            <FollowupRow key={c.parcelId ?? c.address} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FollowupRow({ c }: { c: FollowupScored }) {
  return (
    <li className="p-2 rounded border border-slate-800/60 bg-slate-950/40 hover:bg-slate-900/70">
      <Link
        to={`/property?address=${encodeURIComponent(c.address + ', Denver, CO')}`}
        className="block"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-100 truncate" title={c.address}>
              {c.address}
            </div>
            <div className="text-xs text-slate-500 truncate" title={c.owner}>
              {c.owner ?? '—'}
            </div>
          </div>
          <div className={`text-xl font-bold ${scoreTextColor(c.score)}`}>{c.score}</div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-400">
          {c.units != null && <span>{c.units} units</span>}
          {c.yearBuilt != null && <span>built {c.yearBuilt}</span>}
          {c.signals.yearsHeld != null && <span>{c.signals.yearsHeld}y held</span>}
          {c.signals.outOfStateOwner && <span className="text-amber-300">out-of-state</span>}
        </div>
        {c.reasons.length > 0 && (
          <div className="mt-1 text-xs text-slate-500 italic truncate">
            {c.reasons.join(' · ')}
          </div>
        )}
      </Link>
    </li>
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  if (!v) return null;
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-200">{v}</dd>
    </div>
  );
}

function colorForScore(score: number): string {
  if (score >= 90) return '#10b981'; // emerald-500
  if (score >= 80) return '#84cc16'; // lime-500
  if (score >= 60) return '#f59e0b'; // amber-500
  if (score >= 40) return '#fb923c'; // orange-400
  return '#64748b'; // slate-500
}

function scoreTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-300';
  if (score >= 80) return 'text-lime-300';
  if (score >= 60) return 'text-amber-200';
  if (score >= 40) return 'text-orange-300';
  return 'text-slate-400';
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fmtMoney(n?: number): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtNum(n?: number): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return n.toLocaleString('en-US');
}

// Dark theme for Google Maps — matches the app's slate color palette.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1425' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
