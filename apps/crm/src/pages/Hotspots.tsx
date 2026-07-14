import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MarketKey } from '@mfa/shared';
import { apiFetch } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { API_URL as API_BASE, GOOGLE_MAPS_API_KEY as MAPS_KEY } from '../lib/runtimeEnv';
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets';
import MarketSelect from '../components/MarketSelect';

export default function Hotspots() {
  const { markets } = useMarkets();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<'map' | 'list'>('map');
  // Deep-link via ?market=phoenix (e.g. from Followup's market switcher)
  // wins over the last-picked market in localStorage, which wins over Denver.
  const [market, setMarket] = useState<MarketKey>((searchParams.get('market') as MarketKey) || getStoredMarket());
  const mapDiv = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    name: string;
    score: number;
    rankInMarket?: number;
    totalInMarket?: number;
    medianIncome?: number;
    medianRent?: number;
    population?: number;
    rentBurdenedPct?: number;
    incomePercentile?: number;
    rentPercentile?: number;
    populationPercentile?: number;
    rentBurdenPercentile?: number;
  } | null>(null);

  const cfg = markets.find((m) => m.key === market);

  function onMarketChange(next: MarketKey) {
    setMarket(next);
    setStoredMarket(next);
    setSelected(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!MAPS_KEY) {
        setError('Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY.');
        setStatus('error');
        return;
      }

      setStatus('loading');
      setError(null);

      try {
        const maps = await loadGoogleMaps(MAPS_KEY);
        if (cancelled || !mapDiv.current) return;

        const center = cfg ? { lat: cfg.center[1], lng: cfg.center[0] } : { lat: 39.7392, lng: -104.9903 };

        const map = mapRef.current ?? new maps.Map(mapDiv.current, {
          zoom: 11,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        map.setCenter(center);
        // Clear any polygons from a previous market before loading the new one.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.data.forEach((f: any) => map.data.remove(f));

        setStatus('ready');

        const res = await apiFetch(`${API_BASE}/api/hotspots/${market}`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.status !== 'ok') {
          setError(body.message ?? 'Hotspots not available for this market yet.');
          setStatus('error');
          return;
        }

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
            rankInMarket: toNum(f.getProperty('rankInMarket')),
            totalInMarket: toNum(f.getProperty('totalInMarket')),
            medianIncome: toNum(f.getProperty('medianIncome')),
            medianRent: toNum(f.getProperty('medianRent')),
            population: toNum(f.getProperty('population')),
            rentBurdenedPct: toNum(f.getProperty('rentBurdenedPct')),
            incomePercentile: toNum(f.getProperty('incomePercentile')),
            rentPercentile: toNum(f.getProperty('rentPercentile')),
            populationPercentile: toNum(f.getProperty('populationPercentile')),
            rentBurdenPercentile: toNum(f.getProperty('rentBurdenPercentile')),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{view === 'map' ? cfg?.label ?? 'Deal zones' : 'Hot Zones'}</h1>
          <p className="text-gray-500 text-sm">
            Neighborhoods scored by market fundamentals (income, rent, population, rent burden).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border overflow-hidden text-sm" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setView('map')}
              className={`px-3 py-1.5 ${view === 'map' ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:text-white'}`}
            >
              Map
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 ${view === 'list' ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:text-white'}`}
            >
              List
            </button>
          </div>
          {view === 'map' && <MarketSelect value={market} onChange={onMarketChange} capability="neighborhoodsSupported" />}
          {view === 'map' && <Legend />}
        </div>
      </div>

      {view === 'list' ? (
        <HotZonesList />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div ref={mapDiv} className="h-[70vh] rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }} />

          <aside className="space-y-3">
            {status === 'loading' && (
              <div className="p-4 rounded border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                Loading map and scoring neighborhoods (first load can take a minute — subsequent
                loads are served from a 24h cache)…
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
                {selected.rankInMarket && selected.totalInMarket && (
                  <p className="text-xs text-gray-500 -mt-1">
                    Ranked #{selected.rankInMarket} of {selected.totalInMarket} in {cfg?.label ?? market}
                  </p>
                )}
                <dl className="mt-3 text-sm space-y-1">
                  <Row k="Median HH income" v={fmtMoney(selected.medianIncome)} />
                  <Row k="Median gross rent" v={fmtMoney(selected.medianRent)} />
                  <Row k="Population (tract)" v={fmtNum(selected.population)} />
                  <Row k="Rent-burdened 50%+ (households)" v={fmtNum(selected.rentBurdenedPct)} />
                </dl>

                <ScoreBreakdown
                  totalInMarket={selected.totalInMarket}
                  marketLabel={cfg?.label ?? market}
                  incomePercentile={selected.incomePercentile}
                  rentPercentile={selected.rentPercentile}
                  populationPercentile={selected.populationPercentile}
                  rentBurdenPercentile={selected.rentBurdenPercentile}
                />

                <Link
                  to={`/app/followup?market=${market}&zone=${encodeURIComponent(selected.name)}`}
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
      )}
    </div>
  );
}

function ScoreBreakdown(props: {
  totalInMarket?: number;
  marketLabel: string;
  incomePercentile?: number;
  rentPercentile?: number;
  populationPercentile?: number;
  rentBurdenPercentile?: number;
}) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-gray-400 hover:text-gray-300">Why this score?</summary>
      <div className="mt-2 space-y-2 text-gray-400">
        <p>
          The score is <strong>this neighborhood's rank relative to the other{' '}
          {props.totalInMarket ?? ''} neighborhoods in {props.marketLabel}</strong> — not an
          absolute rating. The top-ranked neighborhood in any market always scores ~95 and the
          bottom ~20, even when every neighborhood's underlying numbers are similar. A single
          input looking unremarkable on its own (e.g. a low household count) doesn't mean the
          score is wrong — it's one of four inputs, and what matters is how it compares to this
          market's other neighborhoods.
        </p>
        <dl className="space-y-1">
          <Row k="Income percentile (25% weight)" v={fmtPct(props.incomePercentile)} />
          <Row k="Rent percentile — lower is better (30% weight)" v={fmtPct(props.rentPercentile)} />
          <Row k="Population percentile (15% weight)" v={fmtPct(props.populationPercentile)} />
          <Row k="Rent-burden percentile (15% weight)" v={fmtPct(props.rentBurdenPercentile)} />
        </dl>
        <p>
          All four are percentiles among this market's neighborhoods, computed from Census ACS
          data for the single tract at this neighborhood's centroid — a large or oddly-shaped
          neighborhood spanning several tracts is represented by just one of them.
        </p>
      </div>
    </details>
  );
}

interface RankedZone {
  market: MarketKey;
  marketLabel: string;
  name: string;
  score: number;
  rankInMarket?: number;
  totalInMarket?: number;
  medianIncome?: number;
  medianRent?: number;
  population?: number;
  rentBurdenedPct?: number;
  breakdown: {
    incomePercentile?: number;
    rentPercentile?: number;
    populationPercentile?: number;
    rentBurdenPercentile?: number;
  };
}

// Cross-market summary: every neighborhood scoring at/above an adjustable
// threshold, across every market with Hotspots live, filterable by market.
function HotZonesList() {
  const { markets } = useMarkets();
  const neighborhoodMarkets = markets.filter((m) => m.neighborhoodsSupported);

  const [minScore, setMinScore] = useState(75);
  const [selectedMarkets, setSelectedMarkets] = useState<Set<MarketKey>>(new Set());
  const [zones, setZones] = useState<RankedZone[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Default to "all markets selected" once the market list loads.
  useEffect(() => {
    if (neighborhoodMarkets.length && selectedMarkets.size === 0) {
      setSelectedMarkets(new Set(neighborhoodMarkets.map((m) => m.key)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighborhoodMarkets.length]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      setError(null);
      try {
        const res = await apiFetch(`${API_BASE}/api/hotspots/all/ranked?minScore=${minScore}&limit=500`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.status !== 'ok') {
          setError(body.message ?? 'Could not load Hot Zones.');
          setStatus('error');
          return;
        }
        setZones(body.data as RankedZone[]);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus('error');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [minScore]);

  function toggleMarket(key: MarketKey) {
    setExpanded(null);
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visible = zones.filter((z) => selectedMarkets.has(z.market));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Score ≥
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-16 rounded border px-2 py-1 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {neighborhoodMarkets.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMarket(m.key)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                selectedMarkets.has(m.key)
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                  : 'text-gray-500 border-gray-700 hover:text-gray-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {status === 'ready' ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : ''}
        </span>
      </div>

      {status === 'loading' && (
        <div className="p-4 rounded border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          Loading neighborhoods across all markets…
        </div>
      )}
      {error && (
        <div className="p-4 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>
      )}
      {status === 'ready' && visible.length === 0 && (
        <div className="p-4 rounded border text-gray-500 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          No neighborhoods match a score of {minScore}+ in the selected markets. Try lowering the threshold.
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-2 font-medium">Neighborhood</th>
                <th className="px-4 py-2 font-medium">Market</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Rank</th>
                <th className="px-4 py-2 font-medium">Median income</th>
                <th className="px-4 py-2 font-medium">Median rent</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((z) => {
                const key = `${z.market}:${z.name}`;
                const isOpen = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="border-b cursor-pointer hover:bg-white/5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="px-4 py-2 text-gray-100">{z.name}</td>
                      <td className="px-4 py-2 text-gray-400">{z.marketLabel}</td>
                      <td className={`px-4 py-2 font-semibold ${scoreTextColor(z.score)}`}>{z.score}</td>
                      <td className="px-4 py-2 text-gray-400">
                        {z.rankInMarket && z.totalInMarket ? `#${z.rankInMarket}/${z.totalInMarket}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-400">{fmtMoney(z.medianIncome) ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-400">{fmtMoney(z.medianRent) ?? '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td colSpan={6} className="px-4 py-3" style={{ background: 'var(--bg-base)' }}>
                          <ScoreBreakdown
                            totalInMarket={z.totalInMarket}
                            marketLabel={z.marketLabel}
                            incomePercentile={z.breakdown.incomePercentile}
                            rentPercentile={z.breakdown.rentPercentile}
                            populationPercentile={z.breakdown.populationPercentile}
                            rentBurdenPercentile={z.breakdown.rentBurdenPercentile}
                          />
                          <Link
                            to={`/app/followup?market=${z.market}&zone=${encodeURIComponent(z.name)}`}
                            className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
                          >
                            Follow-up candidates in this zone →
                          </Link>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function fmtPct(n?: number): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return `${Math.round(n)}th`;
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
