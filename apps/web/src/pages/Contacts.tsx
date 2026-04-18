import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listContacts, type Contact, type ContactSource } from '../lib/api';

export default function Contacts() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ContactSource | ''>('');

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetch() {
    try {
      const data = await listContacts({
        search: search.trim() || undefined,
        source: sourceFilter || undefined,
        limit: 200,
      });
      setRows(data);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <nav className="text-sm text-slate-400 mb-4">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <span>Contacts</span>
        </nav>
        <h1 className="text-3xl font-bold mb-1">Contacts</h1>
        <p className="text-slate-400 mb-6">
          Sponsors, owners, brokers, and anyone else in your pipeline. Auto-imported from SEC
          Form D filings and the Denver portfolio view. Click a row for timeline + follow-ups.
        </p>

        <form
          className="flex flex-wrap items-end gap-3 mb-6 bg-slate-900 border border-slate-800 rounded p-4"
          onSubmit={(e) => { e.preventDefault(); fetch(); }}
        >
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-slate-400 mb-1">Search name / firm</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. All Pro"
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as ContactSource | '')}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1"
            >
              <option value="">any</option>
              <option value="manual">manual</option>
              <option value="form_d">Form D</option>
              <option value="portfolio">portfolio</option>
              <option value="owner">owner</option>
              <option value="loi">loi</option>
            </select>
          </div>
          <button className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-1.5">Filter</button>
        </form>

        {err && <p className="text-rose-400">Error: {err}</p>}
        {rows && <p className="text-sm text-slate-400 mb-3">{rows.length} contacts.</p>}

        <div className="bg-slate-900 border border-slate-800 rounded divide-y divide-slate-800">
          {(rows ?? []).map((c) => (
            <Link
              to={`/contact/${c.id}`}
              key={c.id}
              className="block px-4 py-3 hover:bg-slate-800 flex items-center gap-3"
            >
              <span className="inline-block w-12 text-xs text-slate-500 uppercase">{c.kind}</span>
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-slate-400 w-40">
                {c.city ? `${c.city}, ${c.stateCode ?? ''}` : '—'}
              </span>
              <span className="text-xs text-slate-500 w-20">{c.source}</span>
              <span className="text-xs text-slate-600">
                {new Date(c.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
          {rows && rows.length === 0 && (
            <div className="p-6 text-slate-500 text-center">
              No contacts yet. Try <Link to="/filings" className="underline">SEC Form D filings</Link>{' '}
              to bulk-import sponsors.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
