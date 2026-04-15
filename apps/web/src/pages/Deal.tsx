import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { DealInput, UnderwritingOutput } from '@mfa/shared';
import { previewUnderwriting, saveDeal } from '../lib/api';
import UnderwritingForm from '../components/UnderwritingForm';
import UnderwritingResults from '../components/UnderwritingResults';

const DEFAULT_DEAL: DealInput = {
  address: '',
  name: '',
  assetClass: undefined,
  levers: [],
  notes: '',
  underwriting: {
    purchasePrice: 0,
    units: 0,
    currentGrossRent: 0,
    marketGrossRent: undefined,
    vacancyPct: 5,
    opexPct: 45,
    loan: {
      ltv: 0.65,
      ratePct: 6.5,
      amortYears: 30,
      ioYears: 0,
    },
    rehabBudget: 0,
    closingCostsPct: 2,
  },
};

export default function Deal() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const addressFromQuery = params.get('address') ?? '';

  const [deal, setDeal] = useState<DealInput>({ ...DEFAULT_DEAL, address: addressFromQuery });
  const [out, setOut] = useState<UnderwritingOutput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: number } | null>(null);

  // Debounced live preview
  const u = deal.underwriting;
  const liveKey = useMemo(
    () => JSON.stringify(u),
    [u]
  );
  useEffect(() => {
    if (!u.purchasePrice || !u.units || !u.currentGrossRent) {
      setOut(null);
      return;
    }
    const t = setTimeout(() => {
      previewUnderwriting(u).then(setOut).catch(() => setOut(null));
    }, 300);
    return () => clearTimeout(t);
  }, [liveKey]);

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await saveDeal(deal);
      setSaved({ id: res.id });
      setOut(res.underwritingOutput);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(deal.address && u.purchasePrice && u.units && u.currentGrossRent);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
              ← Home
            </Link>
            <h1 className="text-3xl font-bold mt-2">New Deal</h1>
            <p className="text-slate-400 text-sm mt-1">{deal.address || 'No address set'}</p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/deals"
              className="px-4 py-2 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              All deals
            </Link>
            <button
              onClick={onSave}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 font-semibold text-white"
            >
              {saving ? 'Saving…' : 'Save deal'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            {error}
            {error.includes('db_unavailable') && (
              <div className="text-xs text-rose-300 mt-1">
                Postgres isn't running. Start it with{' '}
                <code className="px-1 bg-slate-900 rounded">docker compose up db</code>.
              </div>
            )}
          </div>
        )}

        {saved && (
          <div className="mb-4 p-3 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm flex justify-between items-center">
            <span>Saved deal #{saved.id}.</span>
            <button
              onClick={() => nav('/deals')}
              className="underline hover:text-emerald-100"
            >
              View all deals →
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
          <div>
            <UnderwritingForm value={deal} onChange={setDeal} />
          </div>
          <div className="lg:sticky lg:top-6 self-start">
            {out ? (
              <UnderwritingResults out={out} />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
                Enter purchase price, units, and current gross rent to see results.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
