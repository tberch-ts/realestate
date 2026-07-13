import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FollowupScored, OwnerCluster, SosEntity } from '@mfa/shared';
import { fetchOwner, fetchSosEntity } from '../lib/api';

export default function Owner() {
  const [params] = useSearchParams();
  const name = params.get('name') ?? '';
  const [cluster, setCluster] = useState<OwnerCluster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sos, setSos] = useState<SosEntity | null>(null);
  const [sosStatus, setSosStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [sosError, setSosError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOwner(name)
      .then((c) => !cancelled && setCluster(c))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [name]);

  async function onUnmask() {
    setSosStatus('loading');
    setSosError(null);
    try {
      const e = await fetchSosEntity(name);
      setSos(e);
      setSosStatus('done');
    } catch (err) {
      setSosError((err as Error).message);
      setSosStatus('error');
    }
  }

  const principalState = sos?.principalAddress ? extractState(sos.principalAddress) : undefined;
  const trueOutOfState =
    principalState && principalState !== 'CO'
      ? principalState
      : cluster?.outOfState
      ? cluster.mailingState
      : undefined;

  return (
    <div>
      <Link to="/app/portfolio" className="text-sm text-blue-400 hover:text-blue-300">
        ← All owners
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6 break-words">{name}</h1>

      {loading && <p className="text-gray-400 text-sm">Loading portfolio…</p>}
      {error && (
        <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-4">
          {error}
        </div>
      )}

      {cluster && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatBox label="Properties" value={cluster.propertyCount} />
            <StatBox label="Total units" value={cluster.totalUnits.toLocaleString()} />
            <StatBox label="Avg year built" value={cluster.avgYearBuilt ?? '—'} />
            <StatBox
              label="Mailing state"
              value={trueOutOfState ?? cluster.mailingState ?? '—'}
              tone={trueOutOfState ? 'amber' : 'default'}
            />
          </div>

          <SosPanel name={name} status={sosStatus} entity={sos} error={sosError} onUnmask={onUnmask} />

          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mt-8 mb-3">
            Properties in this portfolio ({cluster.properties.length})
          </h2>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="py-2 px-3 font-medium">Address</th>
                  <th className="py-2 px-3 font-medium text-right">Units</th>
                  <th className="py-2 px-3 font-medium text-right">Built</th>
                  <th className="py-2 px-3 font-medium text-right">Held</th>
                  <th className="py-2 px-3 font-medium text-right">Last sale</th>
                  <th className="py-2 px-3 font-medium text-right">Score</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {cluster.properties
                  .sort((a, b) => (b.units ?? 0) - (a.units ?? 0))
                  .map((p) => (
                    <Row key={p.parcelId ?? p.address} p={p} />
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SosPanel({
  name,
  status,
  entity,
  error,
  onUnmask,
}: {
  name: string;
  status: 'idle' | 'loading' | 'done' | 'error';
  entity: SosEntity | null;
  error: string | null;
  onUnmask: () => void;
}) {
  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-100">Colorado SOS lookup</h3>
        {status !== 'done' && (
          <button
            onClick={onUnmask}
            disabled={status === 'loading'}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {status === 'loading' ? 'Looking up…' : 'Unmask owner'}
          </button>
        )}
      </div>
      {status === 'idle' && (
        <p className="text-xs text-gray-500">
          Pulls registered-agent address, formation date, and principal office from Colorado
          Secretary of State for "{name}". Free public data.
        </p>
      )}
      {status === 'error' && <p className="text-sm text-rose-400">SOS lookup failed: {error}</p>}
      {status === 'done' && !entity && (
        <p className="text-sm text-gray-400">
          No Colorado SOS entity matched this exact name. The LLC may be registered in another
          state and only filed as a foreign entity here under a slightly different name.
        </p>
      )}
      {status === 'done' && entity && (
        <dl className="text-sm grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          <SosRow k="Entity" v={entity.entityName} />
          <SosRow k="Status" v={entity.status} tone={entity.status === 'Good Standing' ? 'emerald' : 'default'} />
          <SosRow k="SOS ID" v={entity.sosId} />
          <SosRow k="Formed" v={entity.formedDate} />
          <SosRow k="Principal office" v={entity.principalAddress} tone="amber" span={2} />
          <SosRow k="Registered agent" v={entity.registeredAgent?.name} />
          <SosRow k="RA address" v={entity.registeredAgent?.address} />
          {entity.profileUrl && (
            <div className="md:col-span-2 pt-2">
              <a href={entity.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                View on sos.state.co.us ↗
              </a>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function SosRow({
  k,
  v,
  tone = 'default',
  span,
}: {
  k: string;
  v?: string;
  tone?: 'default' | 'emerald' | 'amber';
  span?: number;
}) {
  if (!v) return null;
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-200' : 'text-gray-200';
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <dt className="text-[11px] uppercase tracking-wider text-gray-500">{k}</dt>
      <dd className={color}>{v}</dd>
    </div>
  );
}

function Row({ p }: { p: FollowupScored }) {
  return (
    <tr className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
      <td className="py-2 px-3 align-top">
        <Link to={`/app/property-search?address=${encodeURIComponent(p.address + ', Denver, CO')}`} className="text-gray-100 hover:text-blue-300">
          {p.address}
        </Link>
      </td>
      <td className="py-2 px-3 text-right text-gray-200 align-top">{p.units ?? '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">{p.yearBuilt ?? '—'}</td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">
        {p.signals.yearsHeld != null ? `${p.signals.yearsHeld}y` : '—'}
      </td>
      <td className="py-2 px-3 text-right text-gray-300 align-top">
        {p.salePrice
          ? p.salePrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
          : '—'}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <span className={`font-bold ${scoreColor(p.score)}`}>{p.score}</span>
      </td>
      <td className="py-2 px-3 text-right align-top whitespace-nowrap">
        <Link
          to={`/app/loi?address=${encodeURIComponent(p.address + ', Denver, CO')}${p.units ? `&units=${p.units}` : ''}`}
          className="text-emerald-400 hover:text-emerald-300 text-xs"
        >
          Start LOI →
        </Link>
      </td>
    </tr>
  );
}

function StatBox({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'amber' }) {
  const cls = tone === 'amber' ? 'border-amber-500/40 bg-amber-500/10' : '';
  const val = tone === 'amber' ? 'text-amber-200' : 'text-gray-100';
  return (
    <div className={`p-4 rounded-xl border ${cls}`} style={tone === 'default' ? { borderColor: 'var(--border)', background: 'var(--bg-card)' } : undefined}>
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${val}`}>{value}</div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-300';
  if (score >= 80) return 'text-lime-300';
  if (score >= 60) return 'text-amber-200';
  if (score >= 40) return 'text-orange-300';
  return 'text-gray-400';
}

function extractState(addr: string): string | undefined {
  const m = addr.match(/,\s*([A-Z]{2})\s+\d{5}/);
  return m?.[1];
}
