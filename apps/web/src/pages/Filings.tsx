import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listFormDFilings, getFormDFiling, importContactsFromFormD,
  type FormDSummary, type FormDDetail,
} from '../lib/api';

// Shows Form D (Reg D) filings — private-placement sponsors raising capital.
// One-click "Add to CRM" imports the issuer + all related persons (promoters,
// officers, directors) and links them to the filing for future follow-up.

export default function Filings() {
  const [state, setState] = useState<string>('CO');
  const [keyword, setKeyword] = useState<string>('"real estate"');
  const [rows, setRows] = useState<FormDSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, FormDDetail>>({});
  const [imported, setImported] = useState<Record<string, number>>({}); // accession -> count

  useEffect(() => {
    fetchRows(state, keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRows(st: string, kw: string) {
    setLoading(true);
    setErr(null);
    try {
      const data = await listFormDFilings({ state: st || undefined, keyword: kw || undefined, limit: 100 });
      setRows(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDetail(r: FormDSummary) {
    if (expanded === r.accessionNumber) {
      setExpanded(null);
      return;
    }
    setExpanded(r.accessionNumber);
    if (!details[r.accessionNumber]) {
      try {
        const d = await getFormDFiling(r.accessionNumber, r.cik);
        setDetails((prev) => ({ ...prev, [r.accessionNumber]: d }));
      } catch (e) {
        setDetails((prev) => ({ ...prev, [r.accessionNumber]: { ...(r as unknown as FormDDetail) } }));
        console.error(e);
      }
    }
  }

  async function addToCrm(r: FormDSummary) {
    try {
      const out = await importContactsFromFormD(r.accessionNumber, r.cik);
      setImported((prev) => ({ ...prev, [r.accessionNumber]: out.created.length }));
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <nav className="text-sm text-slate-400 mb-4">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <span>Filings (Form D)</span>
        </nav>
        <h1 className="text-3xl font-bold mb-1">SEC Form D Filings</h1>
        <p className="text-slate-400 mb-6">
          Regulation D exempt-offering filings. These are sponsors actively raising capital for
          private deals — typically including multifamily syndications. Click a row for offering
          details; <em>Add to CRM</em> creates contacts for the issuer and all related persons.
        </p>

        <form
          className="flex flex-wrap items-end gap-3 mb-6 bg-slate-900 border border-slate-800 rounded p-4"
          onSubmit={(e) => { e.preventDefault(); fetchRows(state, keyword); }}
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1">State (biz address)</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="CO"
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 w-20 uppercase"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-slate-400 mb-1">Keyword (EDGAR full-text, in quotes for phrase)</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='"real estate"'
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 w-full"
            />
          </div>
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-1.5">
            Search
          </button>
        </form>

        {loading && <p className="text-slate-400">Loading…</p>}
        {err && <p className="text-rose-400">Error: {err}</p>}

        {rows && (
          <p className="text-sm text-slate-400 mb-3">
            {rows.length} filings in {state || 'any state'} matching {keyword || '(any)'}
            {rows.length === 100 ? ' (showing first 100)' : ''}.
          </p>
        )}

        <div className="space-y-2">
          {(rows ?? []).map((r) => {
            const isOpen = expanded === r.accessionNumber;
            const d = details[r.accessionNumber];
            const count = imported[r.accessionNumber];
            return (
              <div key={r.accessionNumber} className="bg-slate-900 border border-slate-800 rounded">
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-800"
                  onClick={() => toggleDetail(r)}
                >
                  <span className="text-xs text-slate-500 font-mono w-24">{r.filingDate}</span>
                  <span className="text-xs text-slate-500 w-12">{r.form}</span>
                  <span className="flex-1 font-medium">{r.issuerName}</span>
                  <span className="text-xs text-slate-400 w-40">{r.issuerLocation ?? r.issuerState ?? '—'}</span>
                  <span className="text-xs text-slate-500">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 py-3 border-t border-slate-800 text-sm">
                    {!d && <p className="text-slate-500">Loading detail…</p>}
                    {d && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs uppercase text-slate-500 mb-1">Offering</div>
                          <div>Industry: <span className="text-slate-300">{d.industryGroupType ?? '—'}</span></div>
                          <div>Target: <span className="text-slate-300">{d.totalOfferingAmount ?? '—'}</span></div>
                          <div>Sold: <span className="text-emerald-300">${(d.totalAmountSold ?? 0).toLocaleString()}</span></div>
                          <div>Remaining: <span className="text-slate-300">{d.totalRemaining ?? '—'}</span></div>
                          <div>Minimum: <span className="text-slate-300">${(d.minimumInvestment ?? 0).toLocaleString()}</span></div>
                          <div>Investors to date: <span className="text-slate-300">{d.investorCount ?? '—'}</span></div>
                          <div>Non-accredited: <span className="text-slate-300">{d.hasNonAccreditedInvestors ? 'yes' : 'no'}</span></div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-slate-500 mb-1">Issuer</div>
                          <div className="text-slate-300">{d.issuerName}</div>
                          <div className="text-slate-400 text-xs">
                            {d.issuerAddress?.street1}
                            {d.issuerAddress?.street2 ? `, ${d.issuerAddress.street2}` : ''}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {d.issuerAddress?.city}, {d.issuerAddress?.state} {d.issuerAddress?.zip}
                          </div>
                          <div className="text-slate-400 text-xs">{d.issuerPhone ?? ''}</div>
                          <div className="text-slate-400 text-xs mt-1">
                            {d.entityType ?? ''} · Inc. in {d.jurisdictionOfInc ?? '—'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs uppercase text-slate-500 mb-1">Related Persons</div>
                          <ul className="text-slate-300 text-sm divide-y divide-slate-800">
                            {(d.relatedPersons ?? []).map((p, i) => (
                              <li key={i} className="py-1 flex items-center gap-3">
                                <span className="flex-1">{p.name}</span>
                                <span className="text-xs text-slate-500">
                                  {p.relationship.join(', ')}
                                  {p.clarification ? ` — ${p.clarification}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 text-sm"
                        onClick={() => addToCrm(r)}
                        disabled={count != null}
                      >
                        {count != null ? `Added ${count} contacts` : 'Add to CRM'}
                      </button>
                      <a
                        className="text-slate-400 hover:underline text-sm"
                        href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${r.cik}&type=D&dateb=&owner=include&count=40`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on SEC EDGAR ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
