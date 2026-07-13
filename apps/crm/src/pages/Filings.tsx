import { useEffect, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { listFormDFilings, getFormDFiling, type FormDSummary, type FormDDetail } from '../lib/api';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// Shows Form D (Reg D) filings — private-placement sponsors raising capital.
// One-click "Add to CRM" creates Firestore contacts for the issuer + all
// related persons (promoters, officers, directors) straight from the already
// -fetched SEC detail — no Postgres involved, unlike apps/web's version which
// wrote through a apps/api CRM table.

const KEYWORD_PRESETS = [
  { label: 'Real Estate', value: '"real estate"' },
  { label: 'Multifamily', value: 'multifamily' },
  { label: 'Apartments', value: 'apartment' },
  { label: 'Residential', value: 'residential' },
  { label: 'Storage', value: 'storage' },
  { label: 'Opportunity Zone', value: '"opportunity zone"' },
];

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Filings() {
  const { user } = useAuth();
  const [state, setState] = useState<string>('CO');
  const [keyword, setKeyword] = useState<string>('"real estate"');
  const [dateFrom, setDateFrom] = useState<string>(() => isoNDaysAgo(365));
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [limit, setLimit] = useState<number>(100);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'issuer'>('newest');
  const [rows, setRows] = useState<FormDSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, FormDDetail>>({});
  const [imported, setImported] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRows() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listFormDFilings({
        state: state || undefined,
        keyword: keyword || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
      });
      setRows(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function sortedRows(): FormDSummary[] {
    if (!rows) return [];
    const copy = [...rows];
    if (sort === 'newest') copy.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
    else if (sort === 'oldest') copy.sort((a, b) => a.filingDate.localeCompare(b.filingDate));
    else if (sort === 'issuer') copy.sort((a, b) => a.issuerName.localeCompare(b.issuerName));
    return copy;
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
    if (!user) return;
    setImporting(r.accessionNumber);
    try {
      const d = details[r.accessionNumber] ?? (await getFormDFiling(r.accessionNumber, r.cik));
      let count = 0;

      await addDoc(collection(db, 'contacts'), {
        ownerId: user.uid,
        name: d.issuerName,
        kind: 'firm',
        addressLine1: d.issuerAddress?.street1,
        addressLine2: d.issuerAddress?.street2,
        city: d.issuerAddress?.city,
        stateCode: d.issuerAddress?.state,
        zip: d.issuerAddress?.zip,
        phone: d.issuerPhone,
        notes: `SEC Form D issuer — accession ${d.accessionNumber}, filed ${d.filingDate}.`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      count += 1;

      for (const p of d.relatedPersons ?? []) {
        await addDoc(collection(db, 'contacts'), {
          ownerId: user.uid,
          name: p.name,
          kind: 'other',
          city: p.address?.city,
          stateCode: p.address?.state,
          zip: p.address?.zip,
          notes: `${p.relationship.join(', ')}${p.clarification ? ` — ${p.clarification}` : ''} at ${d.issuerName} (Form D accession ${d.accessionNumber}).`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count += 1;
      }

      setImported((prev) => ({ ...prev, [r.accessionNumber]: count }));
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">SEC Form D Filings</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-3xl">
        Regulation D exempt-offering filings. These are sponsors actively raising capital for
        private deals — typically including multifamily syndications. Click a row for offering
        details; "Add to CRM" creates contacts for the issuer and all related persons.
      </p>

      <form
        className="mb-6 rounded-xl border p-4 space-y-3"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        onSubmit={(e) => { e.preventDefault(); fetchRows(); }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="State">
            <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="CO" className={`${INPUT} w-20 uppercase`} style={bd} />
          </Field>
          <Field label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT} style={bd} />
          </Field>
          <Field label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT} style={bd} />
          </Field>
          <Field label="Limit">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={INPUT} style={bd}>
              <option value={50} className="bg-slate-900">50</option>
              <option value={100} className="bg-slate-900">100</option>
              <option value={200} className="bg-slate-900">200</option>
            </select>
          </Field>
          <Field label="Sort">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={INPUT} style={bd}>
              <option value="newest" className="bg-slate-900">Newest first</option>
              <option value="oldest" className="bg-slate-900">Oldest first</option>
              <option value="issuer" className="bg-slate-900">Issuer A–Z</option>
            </select>
          </Field>
          <button type="submit" className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors">
            Search
          </button>
        </div>
        <Field label='Keyword (EDGAR full-text — use "double quotes" for phrase match)'>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder='"real estate"' className={`${INPUT} w-full`} style={bd} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 self-center mr-1">Preset:</span>
          {KEYWORD_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setKeyword(p.value)}
              className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                keyword === p.value ? 'bg-blue-600 border-blue-500 text-white' : 'hover:border-gray-500 text-gray-300'
              }`}
              style={keyword === p.value ? undefined : { borderColor: 'var(--border)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </form>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {err && <p className="text-rose-400 text-sm">Error: {err}</p>}

      {rows && (
        <p className="text-sm text-gray-500 mb-3">
          {rows.length} filings in {state || 'any state'} matching {keyword || '(any)'}
          {rows.length === 100 ? ' (showing first 100)' : ''}.
        </p>
      )}

      <div className="space-y-2">
        {sortedRows().map((r) => {
          const isOpen = expanded === r.accessionNumber;
          const d = details[r.accessionNumber];
          const count = imported[r.accessionNumber];
          return (
            <div key={r.accessionNumber} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors" onClick={() => toggleDetail(r)}>
                <span className="text-xs text-gray-500 font-mono w-24">{r.filingDate}</span>
                <span className="text-xs text-gray-500 w-12">{r.form}</span>
                <span className="flex-1 font-medium">{r.issuerName}</span>
                <span className="text-xs text-gray-400 w-40">{r.issuerLocation ?? r.issuerState ?? '—'}</span>
                <span className="text-xs text-gray-500">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="px-4 py-3 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
                  {!d && <p className="text-gray-500">Loading detail…</p>}
                  {d && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs uppercase text-gray-500 mb-1">Offering</div>
                        <div>Industry: <span className="text-gray-300">{d.industryGroupType ?? '—'}</span></div>
                        <div>Target: <span className="text-gray-300">{d.totalOfferingAmount ?? '—'}</span></div>
                        <div>Sold: <span className="text-emerald-300">${(d.totalAmountSold ?? 0).toLocaleString()}</span></div>
                        <div>Remaining: <span className="text-gray-300">{d.totalRemaining ?? '—'}</span></div>
                        <div>Minimum: <span className="text-gray-300">${(d.minimumInvestment ?? 0).toLocaleString()}</span></div>
                        <div>Investors to date: <span className="text-gray-300">{d.investorCount ?? '—'}</span></div>
                        <div>Non-accredited: <span className="text-gray-300">{d.hasNonAccreditedInvestors ? 'yes' : 'no'}</span></div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-gray-500 mb-1">Issuer</div>
                        <div className="text-gray-300">{d.issuerName}</div>
                        <div className="text-gray-400 text-xs">
                          {d.issuerAddress?.street1}
                          {d.issuerAddress?.street2 ? `, ${d.issuerAddress.street2}` : ''}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {d.issuerAddress?.city}, {d.issuerAddress?.state} {d.issuerAddress?.zip}
                        </div>
                        <div className="text-gray-400 text-xs">{d.issuerPhone ?? ''}</div>
                        <div className="text-gray-400 text-xs mt-1">{d.entityType ?? ''} · Inc. in {d.jurisdictionOfInc ?? '—'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs uppercase text-gray-500 mb-1">Related Persons</div>
                        <ul className="text-gray-300 text-sm divide-y" style={{ borderColor: 'var(--border)' }}>
                          {(d.relatedPersons ?? []).map((p, i) => (
                            <li key={i} className="py-1 flex items-center gap-3">
                              <span className="flex-1">{p.name}</span>
                              <span className="text-xs text-gray-500">
                                {p.relationship.join(', ')}
                                {p.clarification ? ` — ${p.clarification}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      className="px-3 py-1 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
                      onClick={() => addToCrm(r)}
                      disabled={count != null || importing === r.accessionNumber}
                    >
                      {count != null ? `Added ${count} contacts` : importing === r.accessionNumber ? 'Adding…' : 'Add to CRM'}
                    </button>
                    <a
                      className="text-gray-400 hover:underline text-sm"
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = 'rounded-lg border px-2 py-1 text-sm bg-transparent';
const bd = { borderColor: 'var(--border)' };
