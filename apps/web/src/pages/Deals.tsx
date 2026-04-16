import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DealRecord } from '@mfa/shared';
import { fetchDeals } from '../lib/api';

export default function Deals() {
  const [deals, setDeals] = useState<DealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeals()
      .then(setDeals)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
              ← Home
            </Link>
            <h1 className="text-3xl font-bold mt-2">Deals</h1>
          </div>
          <Link
            to="/deal"
            className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 font-semibold text-white"
          >
            + New deal
          </Link>
        </div>

        {error && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            {error}
            {error.includes('503') && (
              <div className="text-xs text-rose-300 mt-1">
                Start Postgres: <code className="px-1 bg-slate-900 rounded">docker compose up db</code>
              </div>
            )}
          </div>
        )}

        {deals && deals.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            No deals saved yet. Enter an address on the home page, then click "Create deal".
          </div>
        )}

        {deals && deals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-xs uppercase tracking-wide">
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2 px-3">Name / address</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">Units</th>
                  <th className="text-right py-2 px-3">Cap</th>
                  <th className="text-right py-2 px-3">DSCR</th>
                  <th className="text-right py-2 px-3">CoC</th>
                  <th className="text-right py-2 px-3">Class</th>
                  <th className="text-right py-2 px-3">Levers</th>
                  <th className="text-right py-2 px-3">Updated</th>
                  <th className="text-right py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-200">{d.name || '(untitled)'}</div>
                      <div className="text-xs text-slate-500">{d.address}</div>
                    </td>
                    <td className="text-right py-2 px-3 text-slate-200">
                      {money(d.underwriting.purchasePrice)}
                    </td>
                    <td className="text-right py-2 px-3 text-slate-200">{d.underwriting.units}</td>
                    <td className="text-right py-2 px-3">{pct(d.underwritingOutput?.capRatePct)}</td>
                    <td className="text-right py-2 px-3">
                      {d.underwritingOutput?.dscr?.toFixed(2) ?? '—'}
                    </td>
                    <td className="text-right py-2 px-3">{pct(d.underwritingOutput?.cashOnCashPct)}</td>
                    <td className="text-right py-2 px-3">{d.assetClass ?? '—'}</td>
                    <td className="text-right py-2 px-3">{d.levers?.length ?? 0}</td>
                    <td className="text-right py-2 px-3 text-slate-500 text-xs">
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="text-right py-2 px-3">
                      <Link
                        to={`/loi?dealId=${d.id}`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        LOI →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function money(n?: number) {
  if (!n || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function pct(n?: number) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}
