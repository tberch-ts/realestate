import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
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

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!MAPS_KEY) {
        setError('Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY.');
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

        const res = await apiFetch(`${API_BASE}/api/hotspots/denver`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const body = await res.json();
        if (cancelled) return;

        map.data.addGeoJson(body.data);
        map.data.setStyle((feature: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = feature as any;
          const score = Number(f.getProperty('score') ?? 0);
          return { fillColor: colorForScore(score), fillOpacity: 0.55, strokeColor: '#0f172a', strokeWeight: 1 };
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Denver deal zones</h1>
          <p className="text-gray-500 text-sm">
            Neighborhoods scored by market fundamentals (income, rent, population, rent burden).
          </p>
        </div>
        <Legend />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div ref={mapDiv} className="h-[70vh] rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }} />

        <aside className="space-y-3">
          {status === 'loading' && (
            <div className="p-4 rounded border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              Loading map and scoring neighborhoods (first load takes 15–30s)…
            </div>
          )}
          {error && (
            <div className="p-4 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>
          )}
          {selected && (
            <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-gray-100">{selected.name}</h3>
                <div className={`text-3xl font-bold ${scoreTextColor(selected.score)}`}>{selected.score}</div>
              </div>
              <dl className="mt-3 text-sm space-y-1">
                <Row k="Median HH income" v={fmtMoney(selected.medianIncome)} />
                <Row k="Median gross rent" v={fmtMoney(selected.medianRent)} />
                <Row k="Population (tract)" v={fmtNum(selected.population)} />
                <Row k="Rent-burdened 50%+" v={fmtNum(selected.rentBurdenedPct)} />
              </dl>
              <Link
                to={`/app/followup?zone=${encodeURIComponent(selected.name)}`}
                className="mt-3 inline-block text-xs text-blue-400 hover:text-blue-300"
              >
                Follow-up candidates in this zone →
              </Link>
            </div>
          )}
          {!selected && status === 'ready' && (
            <div className="p-4 rounded border text-gray-500 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              Click a neighborhood polygon to see details.
            </div>
          )}
        </aside>
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
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: color }} />
          <span className="text-gray-400">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  if (!v) return null;
  return (
    <div className="flex justify-between border-b border-gray-800/60 pb-1">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-gray-200">{v}</dd>
    </div>
  );
}

function colorForScore(score: number): string {
  if (score >= 90) return '#ef4444';
  if (score >= 80) return '#f97316';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#38bdf8';
  return '#3b82f6';
}

function scoreTextColor(score: number): string {
  if (score >= 90) return 'text-red-400';
  if (score >= 80) return 'text-orange-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-sky-400';
  return 'text-blue-400';
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

// Dark theme for Google Maps — matches the app's terminal color palette.
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
