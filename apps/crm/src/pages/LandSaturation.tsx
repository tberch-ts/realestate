import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { LandSaturationZoneProps, MarketKey } from '@mfa/shared';
import { fetchLandSaturationGeoJson } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { GOOGLE_MAPS_API_KEY as MAPS_KEY } from '../lib/runtimeEnv';
import { useMarkets, getStoredMarket, setStoredMarket } from '../lib/markets';
import { DARK_MAP_STYLE } from '../lib/mapStyle';
import { zillowSoldLotsUrl, zillowNewConstructionUrl } from '../lib/zillowLinks';
import MarketSelect from '../components/MarketSelect';

// Builder-activity map, aggregated by ZIP: score-colored bubbles at each
// zip's sold-lot centroid, plus a ranked "hot zips" list. Bubbles (not a
// choropleth) because the unit is a zip code, and land activity is
// county-wide, not bounded by city neighborhoods. Fed by
// GET /api/land/:market/saturation.

interface Zone extends LandSaturationZoneProps {
  lng: number;
  lat: number;
}

export default function LandSaturation() {
  const { markets } = useMarkets();
  const [market, setMarket] = useState<MarketKey>(getStoredMarket());
  const mapDiv = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selected, setSelected] = useState<Zone | null>(null);

  const cfg = markets.find((m) => m.key === market);

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
    setZones([]);
  }

  // Fetch the saturation data whenever the market changes.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setSelected(null);
    fetchLandSaturationGeoJson(market)
      .then((fc) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: Zone[] = (fc.features as any[])
          .map((f) => ({
            ...(f.properties as LandSaturationZoneProps),
            lng: f.geometry?.coordinates?.[0],
            lat: f.geometry?.coordinates?.[1],
          }))
          .filter((z) => Number.isFinite(z.lng) && Number.isFinite(z.lat));
        setZones(rows);
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
  }, [market]);

  // Render markers whenever zones change.
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!MAPS_KEY) {
        setError('Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY.');
        setStatus('error');
        return;
      }
      try {
        const maps = await loadGoogleMaps(MAPS_KEY);
        if (cancelled || !mapDiv.current) return;
        const map =
          mapRef.current ??
          new maps.Map(mapDiv.current, { zoom: 10, styles: DARK_MAP_STYLE, clickableIcons: false });
        mapRef.current = map;
        if (cfg) map.setCenter({ lat: cfg.center[1], lng: cfg.center[0] });

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
        const info = new maps.InfoWindow();
        const bounds = new maps.LatLngBounds();

        for (const z of zones) {
          const marker = new maps.Marker({
            map,
            position: { lat: z.lat, lng: z.lng },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              // Scale bubble by sold-lot volume; color by score.
              scale: 8 + Math.min(22, z.soldLots12mo / 8),
              fillColor: colorForScore(z.score),
              fillOpacity: 0.75,
              strokeColor: '#0f172a',
              strokeWeight: 1,
            },
            label: { text: z.name, color: '#0f172a', fontSize: '10px', fontWeight: '700' },
            title: `${z.name} — score ${z.score}`,
          });
          marker.addListener('click', () => {
            setSelected(z);
            info.setContent(
              `<div style="color:#111;font-size:12px"><strong>${z.name}</strong> · score ${z.score}<br/>` +
                `${z.soldLots12mo} lots sold (12mo)<br/>${z.newConstruction24mo} new builds (24mo)</div>`
            );
            info.open({ map, anchor: marker });
          });
          markersRef.current.push(marker);
          bounds.extend({ lat: z.lat, lng: z.lng });
        }
        if (zones.length > 0) map.fitBounds(bounds, 60);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStatus('error');
        }
      }
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [zones, cfg]);

  const topZones = useMemo(() => [...zones].sort((a, b) => b.score - a.score).slice(0, 25), [zones]);
  // State-qualify the term ("33598, FL") and — crucially — pin the Zillow
  // map to the selected zip's real centroid so a bare ZIP can't geocode to
  // the wrong place. Falls back to the market center when nothing's picked.
  const zillowQuery = selected ? `${selected.name}, ${cfg?.stateCode ?? ''}`.trim() : cfg?.label ?? '';
  const zillowCenter = selected
    ? ([selected.lng, selected.lat] as [number, number])
    : cfg
      ? cfg.center
      : undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Saturation Map</h1>
          <p className="text-gray-500 text-sm">
            Builder activity by ZIP: sold lots (last 12 months) + new construction (last 2 years).
            Bigger, redder bubbles = hotter. Farm the hot zips.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MarketSelect value={market} onChange={onMarketChange} capability="landSupported" />
          <Legend />
        </div>
      </div>

      {status === 'error' && error && (
        <div className="mb-3 p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div
          ref={mapDiv}
          className="h-[70vh] rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        />

        <aside className="space-y-3 max-h-[70vh] overflow-y-auto">
          {status === 'loading' && (
            <div className="p-4 rounded border text-gray-300 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              Scoring ZIP codes by builder activity (first load queries county parcel sales — can take a
              minute; then served from a 24h cache)…
            </div>
          )}

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
                <a href={zillowSoldLotsUrl(zillowQuery, zillowCenter)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  Verify sold lots on Zillow <ExternalLink size={11} />
                </a>
                <a href={zillowNewConstructionUrl(zillowQuery, zillowCenter)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  Verify new construction on Zillow <ExternalLink size={11} />
                </a>
                <Link to={`/app/land/leads?market=${market}&zips=${selected.name}`} className="inline-block text-blue-400 hover:text-blue-300 pt-1">
                  Find lots in {selected.name} →
                </Link>
              </div>
            </div>
          )}

          {status === 'ready' && topZones.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b" style={{ borderColor: 'var(--border)' }}>
                Hottest ZIP codes
              </div>
              {topZones.map((z) => (
                <button
                  key={z.name}
                  onClick={() => setSelected(z)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors ${
                    selected?.name === z.name ? 'bg-white/5' : ''
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="text-gray-200">{z.name}</span>
                  <span className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{z.soldLots12mo} sold</span>
                    <span className={`font-bold ${scoreTextColor(z.score)}`}>{z.score}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {status === 'ready' && topZones.length === 0 && (
            <div className="p-4 rounded border text-gray-500 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              No recent vacant-lot sales found for this market.
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

function fmtNum(n?: number): string {
  return n != null ? n.toLocaleString('en-US') : '—';
}

function fmtMoney(n?: number): string {
  return n != null ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
}
