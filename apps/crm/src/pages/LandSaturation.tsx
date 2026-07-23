import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { MarketKey } from '@mfa/shared';
import { apiFetch } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { API_URL as API_BASE, GOOGLE_MAPS_API_KEY as MAPS_KEY } from '../lib/runtimeEnv';
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets';
import { DARK_MAP_STYLE } from '../lib/mapStyle';
import { zillowSoldLotsUrl, zillowNewConstructionUrl } from '../lib/zillowLinks';
import MarketSelect from '../components/MarketSelect';

// Builder-activity ("saturation") choropleth: zones colored by how many
// lots SOLD in the last 12 months + how much new construction went up in
// the last 2 years. Hot zones = builders actively buying = where you farm
// vacant-lot owners. Same Google Maps Data-layer pattern as Hotspots.tsx,
// fed by GET /api/land/:market/saturation.

export default function LandSaturation() {
  const { markets } = useMarkets();
  const [market, setMarket] = useState<MarketKey>(getStoredMarket());
  const mapDiv = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    name: string;
    score: number;
    soldLots12mo?: number;
    newConstruction24mo?: number;
    medianLotSalePrice?: number;
  } | null>(null);

  const cfg = markets.find((m) => m.key === market);

  // Snap to a land-supported market once the registry loads.
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

        const center = cfg ? { lat: cfg.center[1], lng: cfg.center[0] } : { lat: 27.9506, lng: -82.4572 };
        const map =
          mapRef.current ??
          new maps.Map(mapDiv.current, {
            zoom: 11,
            styles: DARK_MAP_STYLE,
            disableDefaultUI: false,
            clickableIcons: false,
          });
        mapRef.current = map;
        map.setCenter(center);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.data.forEach((f: any) => map.data.remove(f));

        const res = await apiFetch(`${API_BASE}/api/land/${market}/saturation`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.status !== 'ok') {
          setError(body.message ?? 'Land saturation not available for this market yet.');
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
            name: String(f.getProperty('name') ?? 'Unknown'),
            score: Number(f.getProperty('score') ?? 0),
            soldLots12mo: toNum(f.getProperty('soldLots12mo')),
            newConstruction24mo: toNum(f.getProperty('newConstruction24mo')),
            medianLotSalePrice: toNum(f.getProperty('medianLotSalePrice')),
          });
        });

        setStatus('ready');
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

  const zillowQuery = selected ? `${selected.name}, ${cfg?.stateCode ?? ''}` : cfg?.label ?? '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Saturation Map</h1>
          <p className="text-gray-500 text-sm">
            Builder activity by zone: sold lots (last 12 months) + new construction (last 2 years).
            Farm vacant-lot owners where the map runs hot.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MarketSelect value={market} onChange={onMarketChange} capability="landSupported" />
          <Legend />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div
          ref={mapDiv}
          className="h-[70vh] rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        />

        <aside className="space-y-3">
          {status === 'loading' && (
            <div className="p-4 rounded border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              Scoring zones by builder activity (first load queries county parcel sales — can take a
              minute; then served from a 24h cache)…
            </div>
          )}
          {error && <div className="p-4 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>}

          {selected && (
            <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-gray-100">{selected.name}</h3>
                <div className={`text-3xl font-bold ${scoreTextColor(selected.score)}`}>{selected.score}</div>
              </div>
              <dl className="mt-3 text-sm space-y-1">
                <Row k="Lots sold (12 mo)" v={fmtNum(selected.soldLots12mo)} />
                <Row k="New construction (24 mo)" v={fmtNum(selected.newConstruction24mo)} />
                <Row k="Median lot sale price" v={fmtMoney(selected.medianLotSalePrice)} />
              </dl>

              <div className="mt-3 space-y-1.5 text-xs">
                <a href={zillowSoldLotsUrl(zillowQuery)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  Verify sold lots on Zillow <ExternalLink size={11} />
                </a>
                <a href={zillowNewConstructionUrl(zillowQuery)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  Verify new construction on Zillow <ExternalLink size={11} />
                </a>
                <Link to={`/app/land/leads?market=${market}`} className="inline-block text-blue-400 hover:text-blue-300 pt-1">
                  Find lots to contract here →
                </Link>
              </div>
            </div>
          )}
          {!selected && status === 'ready' && (
            <div className="p-4 rounded border text-gray-500 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              Click a zone to see builder activity + Zillow verification links.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400">
      <span>Cold</span>
      {['#334155', '#7c5b12', '#b45309', '#ea580c', '#dc2626'].map((c) => (
        <span key={c} className="w-4 h-3 rounded-sm inline-block" style={{ background: c }} />
      ))}
      <span>Builder-hot</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-gray-200">{v}</dd>
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

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-red-400';
  if (score >= 60) return 'text-orange-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-gray-400';
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fmtNum(n?: number): string {
  return n != null ? n.toLocaleString('en-US') : '—';
}

function fmtMoney(n?: number): string {
  return n != null ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
}
