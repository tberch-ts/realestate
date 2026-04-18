import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getContact, createInteraction, createFollowUp, patchFollowUp, matchContactToPortfolio,
  type ContactDetail as Detail, type InteractionKind,
} from '../lib/api';

const INTERACTION_KINDS: InteractionKind[] = ['call', 'email', 'meeting', 'note', 'outreach_sent', 'reply_received'];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Interaction form
  const [intKind, setIntKind] = useState<InteractionKind>('note');
  const [intSubject, setIntSubject] = useState('');
  const [intBody, setIntBody] = useState('');

  // Follow-up form
  const [fuDue, setFuDue] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [fuSubject, setFuSubject] = useState('');
  const [fuNotes, setFuNotes] = useState('');

  useEffect(() => { if (cid) load(); }, [cid]);

  async function load() {
    try {
      setData(await getContact(cid));
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }

  async function addInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!intSubject.trim() && !intBody.trim()) return;
    try {
      await createInteraction(cid, { kind: intKind, subject: intSubject || undefined, body: intBody || undefined });
      setIntSubject(''); setIntBody('');
      load();
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
  }

  async function addFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!fuSubject.trim() || !fuDue) return;
    try {
      await createFollowUp(cid, { dueDate: fuDue, subject: fuSubject, notes: fuNotes || undefined });
      setFuSubject(''); setFuNotes('');
      load();
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
  }

  async function toggleFollowUpStatus(fuId: number, current: string) {
    const next = current === 'done' ? 'open' : 'done';
    try { await patchFollowUp(fuId, { status: next as 'done' | 'open' }); load(); }
    catch (e) { alert(`Failed: ${(e as Error).message}`); }
  }

  async function runPortfolioMatch() {
    try {
      const out = await matchContactToPortfolio(cid);
      if (out.matches === 0) {
        alert('No matches in Denver portfolio for this contact.');
      } else {
        alert(`Matched ${out.matches} properties in Denver portfolio.`);
        load();
      }
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
  }

  if (err) return <div className="p-8 text-rose-400">Error: {err}</div>;
  if (!data) return <div className="p-8 text-slate-400">Loading…</div>;

  const c = data.contact;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <nav className="text-sm text-slate-400 mb-4">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/contacts" className="hover:underline">Contacts</Link>
          <span className="mx-2">/</span>
          <span>{c.name}</span>
        </nav>

        <div className="bg-slate-900 border border-slate-800 rounded p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-500 uppercase mb-1">{c.kind} · {c.source}</div>
              <h1 className="text-2xl font-bold">{c.name}</h1>
              {c.firmName && c.firmName !== c.name && (
                <div className="text-slate-400">{c.firmName}</div>
              )}
              <div className="text-sm text-slate-400 mt-2">
                {[c.addressLine1, c.addressLine2, c.city, c.stateCode, c.zip].filter(Boolean).join(', ')}
              </div>
              {c.email && <div className="text-sm text-slate-400">{c.email}</div>}
              {c.phone && <div className="text-sm text-slate-400">{c.phone}</div>}
              {c.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.tags.map((t) => (
                    <span key={t} className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {c.notes && <p className="text-sm text-slate-300 mt-3 whitespace-pre-wrap">{c.notes}</p>}
            </div>
            <div className="text-xs text-slate-500 text-right">
              Created {new Date(c.createdAt).toLocaleDateString()}<br />
              Updated {new Date(c.updatedAt).toLocaleDateString()}
              {c.kind === 'firm' && (
                <button
                  onClick={runPortfolioMatch}
                  className="mt-3 block bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  Match Denver portfolio →
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Follow-ups */}
          <section className="bg-slate-900 border border-slate-800 rounded p-5">
            <h2 className="text-lg font-semibold mb-3">Follow-ups</h2>
            <form className="mb-4 space-y-2" onSubmit={addFollowUp}>
              <div className="flex gap-2">
                <input
                  type="date" value={fuDue} onChange={(e) => setFuDue(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
                <input
                  value={fuSubject} onChange={(e) => setFuSubject(e.target.value)}
                  placeholder="Subject (e.g. Intro email)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <textarea
                value={fuNotes} onChange={(e) => setFuNotes(e.target.value)}
                placeholder="Notes (optional)" rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              />
              <button className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 text-sm">
                Schedule follow-up
              </button>
            </form>
            <ul className="divide-y divide-slate-800">
              {data.followUps.length === 0 && <li className="text-slate-500 text-sm py-2">None yet.</li>}
              {data.followUps.map((f) => (
                <li key={f.id} className="py-2 flex items-start gap-2">
                  <input
                    type="checkbox" checked={f.status === 'done'}
                    onChange={() => toggleFollowUpStatus(f.id, f.status)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className={`text-sm ${f.status === 'done' ? 'line-through text-slate-500' : ''}`}>
                      <span className="text-xs text-slate-500 mr-2">{f.dueDate}</span>
                      {f.subject}
                    </div>
                    {f.notes && <div className="text-xs text-slate-500">{f.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Interactions timeline */}
          <section className="bg-slate-900 border border-slate-800 rounded p-5">
            <h2 className="text-lg font-semibold mb-3">Timeline</h2>
            <form className="mb-4 space-y-2" onSubmit={addInteraction}>
              <div className="flex gap-2">
                <select
                  value={intKind} onChange={(e) => setIntKind(e.target.value as InteractionKind)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                >
                  {INTERACTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input
                  value={intSubject} onChange={(e) => setIntSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <textarea
                value={intBody} onChange={(e) => setIntBody(e.target.value)}
                placeholder="What happened?" rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              />
              <button className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 text-sm">
                Log entry
              </button>
            </form>
            <ul className="divide-y divide-slate-800">
              {data.interactions.length === 0 && <li className="text-slate-500 text-sm py-2">No activity yet.</li>}
              {data.interactions.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="text-xs text-slate-500">
                    {new Date(i.occurredAt).toLocaleString()} · {i.kind}
                  </div>
                  {i.subject && <div className="text-sm font-medium">{i.subject}</div>}
                  {i.body && <div className="text-sm text-slate-300 whitespace-pre-wrap">{i.body}</div>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Filings + Properties */}
        {(data.filings.length > 0 || data.properties.length > 0) && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {data.filings.length > 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded p-5">
                <h2 className="text-lg font-semibold mb-3">SEC Filings</h2>
                <ul className="text-sm space-y-2">
                  {data.filings.map((f, i) => (
                    <li key={i}>
                      <span className="text-xs text-slate-500 mr-2">{f.relation}</span>
                      <a className="underline"
                         href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${f.cik}&type=D`}
                         target="_blank" rel="noreferrer">
                        {f.accessionNumber}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.properties.length > 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded p-5">
                <h2 className="text-lg font-semibold mb-3">Properties</h2>
                <ul className="text-sm space-y-2">
                  {data.properties.map((p, i) => (
                    <li key={i}>
                      <span className="text-xs text-slate-500 mr-2">{p.relation}</span>
                      {p.propertyRef}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
