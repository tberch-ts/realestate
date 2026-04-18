import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFormDFilings, importContactsFromFormD, type FormDSummary } from '../lib/api';

// Shows recent Form D filings whose issuer business-address city matches the
// property's city. Gives a quick view of "which sponsors are raising capital
// around here?" with one-click import into the CRM.

export default function SponsorsInCityPanel({ city, stateCode }: { city?: string; stateCode?: string }) {
  const [rows, setRows] = useState<FormDSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState<Record<string, { count: number; portfolioMatches: number }>>({});

  useEffect(() => {
    if (!city || !stateCode) return;
    setLoading(true);
    setErr(null);
    listFormDFilings({ state: stateCode, keyword: '"real estate"', limit: 200 })
      .then((all) => {
        const needle = city.toLowerCase();
        const matches = all
          .filter((r) => (r.issuerLocation ?? '').toLowerCase().includes(needle))
          .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
          .slice(0, 10);
        setRows(matches);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [city, stateCode]);

  async function addToCrm(r: FormDSummary) {
    try {
      const out = await importContactsFromFormD(r.accessionNumber, r.cik);
      const totalPortfolio = out.created.reduce((s, c) => s + (c.portfolioMatches ?? 0), 0);
      setImported((prev) => ({
        ...prev,
        [r.accessionNumber]: { count: out.created.length, portfolioMatches: totalPortfolio },
      }));
    } catch (e) { alert(`Import failed: ${(e as Error).message}`); }
  }

  if (!city || !stateCode) return null;

  return (
    <section className="mt-8 bg-slate-900 border border-slate-800 rounded p-5">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-semibold">Sponsors active in {city}</h2>
        <span className="text-xs text-slate-500">Form D filings, last year, real estate keyword</span>
        <Link to="/filings" className="ml-auto text-xs text-indigo-400 hover:text-indigo-300">
          Full filings browser →
        </Link>
      </div>
      {loading && <p className="text-slate-400 text-sm">Loading…</p>}
      {err && <p className="text-rose-400 text-sm">Error: {err}</p>}
      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No Form D filings in the last year match <code>{city}, {stateCode}</code> with the real-estate keyword.
          Try <Link to="/filings" className="underline">broader search</Link>.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-800">
          {rows.map((r) => {
            const imp = imported[r.accessionNumber];
            return (
              <li key={r.accessionNumber} className="py-2 flex items-center gap-3 text-sm">
                <span className="text-xs text-slate-500 font-mono w-24">{r.filingDate}</span>
                <span className="flex-1 truncate">{r.issuerName}</span>
                <span className="text-xs text-slate-500 w-10">{r.form}</span>
                {imp ? (
                  <span className="text-xs text-emerald-400">
                    +{imp.count} contacts{imp.portfolioMatches > 0 ? `, ${imp.portfolioMatches} portfolio` : ''}
                  </span>
                ) : (
                  <button
                    onClick={() => addToCrm(r)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-2 py-0.5"
                  >
                    Add to CRM
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
