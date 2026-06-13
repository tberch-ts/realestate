import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getContact, createInteraction, createFollowUp, patchFollowUp, matchContactToPortfolio,
  getPostGridStatus, sendPostGridLetterToContact, listLettersForContact,
  type ContactDetail as Detail, type InteractionKind, type Letter,
} from '../lib/api';

const INTERACTION_KINDS: InteractionKind[] = ['call', 'email', 'meeting', 'note', 'outreach_sent', 'reply_received'];

const OUTREACH_TEMPLATES: Array<{ label: string; subject: (ctx: TemplateCtx) => string; body: (ctx: TemplateCtx) => string }> = [
  {
    label: 'Cold intro (Form D sponsor)',
    subject: (c) => `Quick intro — saw your ${c.lastFiling ? 'recent Form D filing' : 'firm'}`,
    body: (c) =>
      `Hi ${c.firstName || c.name},\n\n` +
      `I came across ${c.firmName || c.name}${c.lastFiling ? ` through SEC Form D filings` : ''} and wanted to introduce myself.\n\n` +
      `I invest in multifamily in the Denver metro and am always interested in meeting sponsors with local track records. ` +
      `Are you open to a brief call to compare notes on the market?\n\n` +
      `Thanks,\nTom`,
  },
  {
    label: 'Ask for deck / offering memo',
    subject: (c) => `${c.firmName || c.name} — LP materials?`,
    body: (c) =>
      `Hi ${c.firstName || c.name},\n\n` +
      `Hope you're well. If you have a current investor deck or offering memo for an open deal, ` +
      `would you mind sharing? Targeting ~$${c.ticket || '50k-200k'} LP positions in multifamily.\n\n` +
      `Happy to sign an NDA if needed.\n\nThanks,\nTom`,
  },
  {
    label: 'Partnership / co-invest',
    subject: () => 'Denver multifamily partnership?',
    body: (c) =>
      `Hi ${c.firstName || c.name},\n\n` +
      `I'm an active investor in Denver multifamily and noticed our paths might align. ` +
      `Do you ever partner on deals with LP/GP splits or JV structures? Happy to share what I'm working on.\n\n` +
      `Thanks,\nTom`,
  },
  {
    label: 'Follow-up (no prior reply)',
    subject: () => 'Following up',
    body: (c) =>
      `Hi ${c.firstName || c.name},\n\n` +
      `Circling back on my earlier note. Appreciate you're busy — let me know if a quick call next week or the one after works.\n\n` +
      `Thanks,\nTom`,
  },
];

interface TemplateCtx {
  name: string;
  firstName?: string;
  firmName?: string;
  lastFiling?: string;
  ticket?: string;
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Interaction form
  const [intKind, setIntKind] = useState<InteractionKind>('note');
  const [intSubject, setIntSubject] = useState('');
  const [intBody, setIntBody] = useState('');
  const [intOccurredAt, setIntOccurredAt] = useState(''); // empty = default to now at submit

  // Outreach composer
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outTo, setOutTo] = useState('');
  const [outSubject, setOutSubject] = useState('');
  const [outBody, setOutBody] = useState('');

  // Postal mail composer
  const [mailOpen, setMailOpen] = useState(false);
  const [mailSubject, setMailSubject] = useState('');
  const [mailHtml, setMailHtml] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailStatus, setMailStatus] = useState<{ apiKey: boolean; senderConfigured: boolean } | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);

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
      // Also load letters + PostGrid status (best-effort; don't block page)
      listLettersForContact(cid).then(setLetters).catch(() => {});
      getPostGridStatus().then((s) => setMailStatus({ apiKey: s.apiKey, senderConfigured: s.senderConfigured })).catch(() => {});
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }

  async function addInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!intSubject.trim() && !intBody.trim()) return;
    try {
      // occurredAt defaults to now at submit time, not page load
      const occurredAt = intOccurredAt || new Date().toISOString();
      await createInteraction(cid, { kind: intKind, subject: intSubject || undefined, body: intBody || undefined, occurredAt });
      setIntSubject(''); setIntBody(''); setIntOccurredAt('');
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

  function openOutreachComposer() {
    if (!data) return;
    const c = data.contact;
    setOutTo(c.email ?? '');
    setOutreachOpen(true);
    // Apply default template
    const ctx = buildCtx(c);
    const t = OUTREACH_TEMPLATES[0];
    setOutSubject(t.subject(ctx));
    setOutBody(t.body(ctx));
  }

  function applyTemplate(idx: number) {
    if (!data) return;
    const ctx = buildCtx(data.contact);
    const t = OUTREACH_TEMPLATES[idx];
    setOutSubject(t.subject(ctx));
    setOutBody(t.body(ctx));
  }

  function buildCtx(c: Detail['contact']): TemplateCtx {
    const parts = c.name.trim().split(/\s+/);
    const firstName = c.kind === 'person' ? parts[0] : undefined;
    return {
      name: c.name,
      firstName,
      firmName: c.firmName ?? (c.kind === 'firm' ? c.name : undefined),
      lastFiling: data?.filings[0]?.accessionNumber,
    };
  }

  async function sendOutreach() {
    if (!outSubject.trim() && !outBody.trim()) return;
    const mailto = `mailto:${encodeURIComponent(outTo)}?subject=${encodeURIComponent(outSubject)}&body=${encodeURIComponent(outBody)}`;
    // Open the user's default mail client in a new tab — browser handles the handoff.
    window.location.href = mailto;
    // Log it immediately — mailto: is fire-and-forget; we can't know for sure they sent it,
    // but the CRM captures intent so it shows up on the timeline.
    try {
      await createInteraction(cid, {
        kind: 'outreach_sent',
        subject: outSubject,
        body: `To: ${outTo}\n\n${outBody}`,
      });
      setOutreachOpen(false);
      setOutTo(''); setOutSubject(''); setOutBody('');
      load();
    } catch (e) { alert(`Logged failed: ${(e as Error).message}`); }
  }

  function openMailComposer() {
    if (!data) return;
    const c = data.contact;
    const first = c.kind === 'person' ? c.name.split(/\s+/)[0] : c.name;
    setMailSubject('Interest in your Denver property');
    setMailHtml(
      `<p>Dear ${first},</p>\n` +
      `<p>My name is Tom. I'm a multifamily investor active in Denver, and I wanted to reach out about your property portfolio.</p>\n` +
      `<p>I specialize in off-market acquisitions of 100+ unit assets and would welcome a brief conversation about whether any of your holdings might be a fit — either for an outright sale or a structured partnership.</p>\n` +
      `<p>If this is of any interest, my direct line is [YOUR PHONE] or simply reply to this letter.</p>\n` +
      `<p>Best regards,<br>Tom</p>`
    );
    setMailOpen(true);
  }

  async function sendMail() {
    if (!mailHtml.trim()) return;
    setMailSending(true);
    try {
      const out = await sendPostGridLetterToContact({
        contactId: cid,
        html: mailHtml,
        subject: mailSubject || undefined,
      });
      alert(
        `Letter created in PostGrid (${out.postgrid.live ? 'LIVE' : 'TEST'} mode).\n` +
        `ID: ${out.postgrid.id}\nStatus: ${out.postgrid.status}`
      );
      setMailOpen(false);
      setMailSubject(''); setMailHtml('');
      load();
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
    finally { setMailSending(false); }
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
            <div className="text-xs text-slate-500 text-right space-y-2">
              <div>
                Created {new Date(c.createdAt).toLocaleDateString()}<br />
                Updated {new Date(c.updatedAt).toLocaleDateString()}
              </div>
              <button
                onClick={openOutreachComposer}
                className="block ml-auto bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 rounded px-3 py-1 text-xs text-white"
              >
                Compose email →
              </button>
              <button
                onClick={openMailComposer}
                disabled={!c.addressLine1 || !mailStatus?.apiKey || !mailStatus?.senderConfigured}
                title={
                  !c.addressLine1 ? 'Contact has no address — add one via API first' :
                  !mailStatus?.apiKey ? 'POSTGRID_API_KEY not set on server' :
                  !mailStatus?.senderConfigured ? 'Configure your return address in Settings' :
                  ''
                }
                className="block ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded px-3 py-1 text-xs text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send postal letter →
              </button>
              {c.kind === 'firm' && (
                <button
                  onClick={runPortfolioMatch}
                  className="block ml-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  Match Denver portfolio →
                </button>
              )}
            </div>
          </div>
        </div>

        {mailOpen && (
          <div className="bg-slate-900 border border-blue-700 rounded p-5 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold">Postal letter (PostGrid)</h2>
              <button onClick={() => setMailOpen(false)} className="text-xs text-slate-400 hover:underline">
                Cancel
              </button>
            </div>
            <div className="mb-3 text-xs text-slate-400">
              Recipient: <span className="text-slate-200">
                {c.name}{c.addressLine1 ? `, ${c.addressLine1}, ${c.city}, ${c.stateCode} ${c.zip}` : ''}
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Subject / internal description</label>
                <input
                  value={mailSubject} onChange={(e) => setMailSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Body (HTML — PostGrid supports basic tags: p, h1–h6, br, b/strong, i/em, ul/ol/li, a)
                </label>
                <textarea
                  value={mailHtml} onChange={(e) => setMailHtml(e.target.value)} rows={14}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <button onClick={sendMail} disabled={mailSending}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-4 py-1.5 text-sm text-white">
                  {mailSending ? 'Sending…' : 'Send via PostGrid'}
                </button>
                <span>
                  Your API key is in test mode — letters are created in PostGrid but not printed/mailed.
                </span>
              </div>
            </div>
          </div>
        )}

        {outreachOpen && (
          <div className="bg-slate-900 border border-emerald-700 rounded p-5 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold">Outreach email</h2>
              <button onClick={() => setOutreachOpen(false)} className="text-xs text-slate-400 hover:underline">
                Cancel
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-xs text-slate-500 self-center mr-1">Template:</span>
              {OUTREACH_TEMPLATES.map((t, i) => (
                <button
                  key={t.label} type="button" onClick={() => applyTemplate(i)}
                  className="text-xs px-2 py-0.5 rounded border bg-slate-950 border-slate-700 hover:border-slate-500 text-slate-300"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">To</label>
                <input
                  value={outTo} onChange={(e) => setOutTo(e.target.value)}
                  placeholder={c.email ? c.email : '(no email on file — fill in)'}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Subject</label>
                <input
                  value={outSubject} onChange={(e) => setOutSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Body</label>
                <textarea
                  value={outBody} onChange={(e) => setOutBody(e.target.value)} rows={10}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <button onClick={sendOutreach}
                  className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-1.5 text-sm text-white">
                  Open in email client + log
                </button>
                <span>
                  Opens your default mail app with the message prefilled; logs an
                  &apos;outreach_sent&apos; entry on the timeline.
                </span>
              </div>
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={intOccurredAt} onChange={(e) => setIntOccurredAt(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-400"
                />
                <span className="text-xs text-slate-600">leave blank to use current time</span>
              </div>
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

        {letters.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded p-5 mt-6">
            <h2 className="text-lg font-semibold mb-3">Letters mailed</h2>
            <ul className="text-sm divide-y divide-slate-800">
              {letters.map((l) => (
                <li key={l.id} className="py-2 flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24">{new Date(l.createdAt).toLocaleDateString()}</span>
                  <span className="text-xs font-mono text-slate-400 w-52 truncate">{l.providerId ?? '(no id)'}</span>
                  <span className="flex-1 text-slate-200 truncate">{l.subject ?? '(no subject)'}</span>
                  <span className="text-xs text-slate-500">
                    {l.live ? 'LIVE' : 'TEST'} · {l.status}
                  </span>
                  {l.carrierTracking?.trackingUrl && (
                    <a className="text-xs text-indigo-400 underline" href={l.carrierTracking.trackingUrl} target="_blank" rel="noreferrer">
                      track
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

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
