import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPostGridStatus, setPostGridSender, type PostGridAddress } from '../lib/api';

// Settings for app-level config. Right now: PostGrid sender address.
// Future: email sender, notification prefs, default buyBox thresholds, etc.

const BLANK_SENDER: PostGridAddress = {
  firstName: '',
  lastName: '',
  companyName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  provinceOrState: '',
  postalOrZip: '',
  countryCode: 'US',
};

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [sender, setSender] = useState<PostGridAddress>(BLANK_SENDER);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const s = await getPostGridStatus();
      setApiKeyConfigured(s.apiKey);
      if (s.sender) setSender({ ...BLANK_SENDER, ...s.sender });
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setErr(null);
    try {
      await setPostGridSender(sender);
      setSavedMsg('Saved.');
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  function patch<K extends keyof PostGridAddress>(k: K, v: PostGridAddress[K]) {
    setSender((prev) => ({ ...prev, [k]: v }));
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <nav className="text-sm text-slate-400 mb-4">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <span>Settings</span>
        </nav>
        <h1 className="text-3xl font-bold mb-1">Settings</h1>
        <p className="text-slate-400 mb-6">App-level configuration.</p>

        <section className="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
          <h2 className="text-lg font-semibold mb-1">PostGrid — postal mail</h2>
          <p className="text-sm text-slate-400 mb-4">
            Outgoing postal mail (LOIs, owner outreach) ships through{' '}
            <a className="underline" href="https://postgrid.com" target="_blank" rel="noreferrer">PostGrid</a>.
            API key is set as a server secret. Your return address below is what the recipient sees — and
            is required before any letter can be sent.
          </p>
          <div className="mb-4 text-sm">
            <span className="text-slate-400 mr-2">API key:</span>
            {apiKeyConfigured
              ? <span className="text-emerald-400">configured ✓</span>
              : <span className="text-rose-400">not configured — ask Claude to inject POSTGRID_API_KEY</span>}
          </div>

          <form className="space-y-3" onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" value={sender.firstName ?? ''} onChange={(v) => patch('firstName', v)} />
              <Field label="Last name"  value={sender.lastName ?? ''}  onChange={(v) => patch('lastName', v)} />
            </div>
            <Field label="Company (optional)" value={sender.companyName ?? ''} onChange={(v) => patch('companyName', v)} />
            <Field label="Address line 1" required value={sender.addressLine1} onChange={(v) => patch('addressLine1', v)} />
            <Field label="Address line 2" value={sender.addressLine2 ?? ''} onChange={(v) => patch('addressLine2', v)} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" required value={sender.city} onChange={(v) => patch('city', v)} />
              <Field label="State" required value={sender.provinceOrState}
                     onChange={(v) => patch('provinceOrState', v.toUpperCase().slice(0, 2))} className="uppercase" />
              <Field label="ZIP" required value={sender.postalOrZip} onChange={(v) => patch('postalOrZip', v)} />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-1.5 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save sender'}
              </button>
              {savedMsg && <span className="text-emerald-400 text-sm">{savedMsg}</span>}
              {err && <span className="text-rose-400 text-sm">{err}</span>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, required, className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs text-slate-400 mb-1">{label}{required && <span className="text-rose-400"> *</span>}</div>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm ${className ?? ''}`}
      />
    </label>
  );
}
