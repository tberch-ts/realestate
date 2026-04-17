import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadGoogleMaps } from '../lib/googleMaps';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
        setError(
          'Missing VITE_GOOGLE_MAPS_API_KEY in .env. Add it and restart the web dev server.'
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
