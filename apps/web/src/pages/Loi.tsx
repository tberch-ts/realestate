import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  AssetClass,
  DealInput,
  LoiDealContext,
  LoiDraft,
  LoiInput,
} from '@mfa/shared';
import {
  createDraft,
  deleteDraft,
  downloadLoi,
  fetchDeal,
  loadDraft,
  mailLoi,
  updateDraft,
  type PostGridAddress,
} from '../lib/api';

const DEFAULT_DD_MATERIALS = [
  'Trailing-12-month operating statements (T12)',
  'Current rent roll with lease expirations',
  'Historical operating statements (3 years)',
  'Property tax bills and assessment notices',
  'Utility bills (24 months)',
  'Service contracts and vendor agreements',
  'Existing title policy and survey',
  'Environmental reports (Phase I/II)',
  'Capital-improvement records',
  'Pending litigation disclosures',
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export default function Loi() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const draftIdParam = params.get('draftId');
  const dealIdParam = params.get('dealId');
  const addressParam = params.get('address') ?? '';
  const unitsParam = params.get('units');

  const [draftId, setDraftId] = useState<number | null>(
    draftIdParam ? Number(draftIdParam) : null
  );
  const [loi, setLoi] = useState<LoiInput>(() => defaultLoi());
  const [dealContext, setDealContext] = useState<LoiDealContext>(() => ({
    address: addressParam,
    units: unitsParam ? Number(unitsParam) : undefined,
    purchasePrice: 0,
    assetClass: 'unknown' as AssetClass,
  }));
  const [status, setStatus] = useState<LoiDraft['status']>('draft');

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailRecipient, setMailRecipient] = useState<PostGridAddress>(() => ({
    addressLine1: '', city: '', provinceOrState: 'CO', postalOrZip: '', countryCode: 'US',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Ensures autosave isn't triggered during initial hydration.
  const hydrating = useRef(true);

  // ---------- Initial load: 3 entry modes ----------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (draftIdParam) {
          // Mode 1: ?draftId=X
          const d = await loadDraft(Number(draftIdParam));
          if (cancelled) return;
          setDraftId(d.id);
          setLoi(d.loi);
          setDealContext(d.dealContext);
          setStatus(d.status);
          setSavedAt(new Date(d.updatedAt));
        } else if (dealIdParam) {
          // Mode 2: ?dealId=X — hydrate a fresh draft from a saved deal
          const deal = await fetchDeal(Number(dealIdParam));
          if (cancelled) return;
          const ctx: LoiDealContext = {
            address: deal.address,
            name: deal.name,
            units: deal.underwriting.units,
            assetClass: deal.assetClass,
            purchasePrice: deal.underwriting.purchasePrice,
          };
          setDealContext(ctx);
          // Create a draft linked to this deal so autosave has something to write to.
          const created = await createDraft({
            address: deal.address,
            dealId: deal.id,
            propertyId: deal.propertyId,
            loi,
            dealContext: ctx,
          }).catch(() => null);
          if (cancelled) return;
          if (created) {
            setDraftId(created.id);
            setSavedAt(new Date(created.updatedAt));
          } else {
            setSaveState('offline');
          }
        } else if (addressParam) {
          // Mode 3: ?address=X (&units=N) — brand new draft from a property click
          const ctx: LoiDealContext = {
            address: addressParam,
            units: unitsParam ? Number(unitsParam) : undefined,
            purchasePrice: 0,
            assetClass: 'unknown' as AssetClass,
          };
          setDealContext(ctx);
          const created = await createDraft({
            address: addressParam,
            loi,
            dealContext: ctx,
          }).catch(() => null);
          if (cancelled) return;
          if (created) {
            setDraftId(created.id);
            setSavedAt(new Date(created.updatedAt));
          } else {
            setSaveState('offline');
          }
        } else {
          setLoadError(
            'No address, dealId, or draftId in URL. Start from a property or the follow-up list.'
          );
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) {
          setLoaded(true);
          // Release hydrating lock on next tick so autosave effect doesn't fire on hydration.
          setTimeout(() => {
            hydrating.current = false;
          }, 50);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Debounced autosave ----------
  const saveRef = useRef<number | null>(null);
  useEffect(() => {
    if (hydrating.current) return;
    if (!draftId) return;
    if (saveRef.current) window.clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(() => {
      setSaveState('saving');
      updateDraft(draftId, { loi, dealContext, status })
        .then((d) => {
          setSaveState('saved');
          setSavedAt(new Date(d.updatedAt));
        })
        .catch(() => setSaveState('error'));
    }, 500);
    return () => {
      if (saveRef.current) window.clearTimeout(saveRef.current);
    };
  }, [loi, dealContext, status, draftId]);

  // ---------- PDF download ----------
  async function onDownload() {
    setError(null);
    setDownloading(true);
    try {
      await downloadLoi(buildDeal(), loi);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function onDelete() {
    if (!draftId) return;
    if (!confirm('Delete this LOI draft? This cannot be undone.')) return;
    try {
      await deleteDraft(draftId);
      nav('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onMarkSent() {
    setStatus('sent');
  }

  function buildDeal(): DealInput {
    return {
      address: dealContext.address,
      name: dealContext.name,
      assetClass: dealContext.assetClass,
      underwriting: {
        purchasePrice: dealContext.purchasePrice ?? 0,
        units: dealContext.units ?? 0,
        currentGrossRent: 0,
        vacancyPct: 5,
        opexPct: 45,
        loan: { ltv: 0.65, ratePct: 6.5, amortYears: 30 },
      },
    };
  }

  function openMailComposer() {
    // Pre-fill recipient line1 from sellerAddress if present (best-effort).
    const sellerAddr = (loi.sellerAddress ?? '').trim();
    setMailRecipient({
      companyName: loi.sellerEntity || undefined,
      addressLine1: sellerAddr || '',
      city: '',
      provinceOrState: 'CO',
      postalOrZip: '',
      countryCode: 'US',
    });
    setMailOpen(true);
  }

  async function onMail() {
    setError(null);
    if (!mailRecipient.addressLine1 || !mailRecipient.city || !mailRecipient.postalOrZip) {
      alert('Recipient address, city, and ZIP are required.');
      return;
    }
    setMailing(true);
    try {
      const out = await mailLoi({
        deal: buildDeal(),
        loi,
        recipient: mailRecipient,
        draftId: draftId ?? undefined,
      });
      alert(
        `LOI mailed via PostGrid (${out.mode === 'live' ? 'LIVE' : 'TEST'} mode).\n` +
        `Letter ID: ${out.postgrid.id}\nStatus: ${out.postgrid.status}`
      );
      setMailOpen(false);
      if (status === 'draft') setStatus('sent');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMailing(false);
    }
  }

  function toggleDd(item: string) {
    const has = loi.ddMaterials.includes(item);
    setLoi({
      ...loi,
      ddMaterials: has ? loi.ddMaterials.filter((x) => x !== item) : [...loi.ddMaterials, item],
    });
  }

  const priceMissing = !dealContext.purchasePrice || dealContext.purchasePrice === 0;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="min-w-0 flex-1">
            <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
              ← Home
            </Link>
            <h1 className="text-3xl font-bold mt-2">Letter of Intent</h1>
            <p className="text-slate-400 text-sm mt-1 truncate" title={dealContext.address}>
              {dealContext.address || 'No address'}
              {status !== 'draft' && (
                <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-300 uppercase">
                  {status}
                </span>
              )}
            </p>
            <SaveIndicator state={saveState} at={savedAt} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {draftId && status === 'draft' && (
              <button
                onClick={onMarkSent}
                className="px-3 py-2 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-sm"
              >
                Mark as sent
              </button>
            )}
            <button
              onClick={onDownload}
              disabled={!loaded || downloading || !dealContext.address}
              className="px-5 py-2 rounded bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 font-semibold text-white"
            >
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
            <button
              onClick={openMailComposer}
              disabled={!loaded || mailing || !dealContext.address}
              title="Mail this LOI via PostGrid (uses current dev/live mode)"
              className="px-5 py-2 rounded border border-blue-500 text-blue-100 hover:bg-blue-500/20 disabled:opacity-40 font-semibold text-sm"
            >
              {mailing ? 'Mailing…' : 'Mail via PostGrid'}
            </button>
            {draftId && (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-sm"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {loadError && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-6">
            {loadError}
          </div>
        )}
        {saveState === 'offline' && (
          <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm mb-6">
            Working in offline mode — autosave disabled. Start Postgres (<code className="text-xs">docker compose up db</code>) to enable draft persistence.
          </div>
        )}
        {priceMissing && loaded && (
          <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm mb-6">
            Purchase price not set — the PDF will render <code>$0</code>. Fill in the price below to make this offer usable.
          </div>
        )}
        {error && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-6">
            {error}
          </div>
        )}

        {mailOpen && (
          <div className="p-4 rounded-xl border border-blue-700 bg-slate-900 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-lg font-semibold">Mail LOI via PostGrid</h3>
              <button onClick={() => setMailOpen(false)} className="text-xs text-slate-400 hover:underline">
                Cancel
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              The PDF you'd download is sent directly to PostGrid as the letter content. Confirm the recipient address; this is what will be printed on the envelope.
              {' '}Mode is controlled by the global <span className="font-semibold">DEV/LIVE</span> toggle (Ctrl+Alt+D).
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2">
                <div className="text-xs text-slate-400 mb-1">Company / addressee (optional)</div>
                <input value={mailRecipient.companyName ?? ''}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, companyName: e.target.value })}
                  placeholder={loi.sellerEntity || 'Owner LLC'}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <label>
                <div className="text-xs text-slate-400 mb-1">First name</div>
                <input value={mailRecipient.firstName ?? ''}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, firstName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <label>
                <div className="text-xs text-slate-400 mb-1">Last name</div>
                <input value={mailRecipient.lastName ?? ''}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, lastName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <label className="col-span-2">
                <div className="text-xs text-slate-400 mb-1">Address line 1 *</div>
                <input value={mailRecipient.addressLine1}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, addressLine1: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <label className="col-span-2">
                <div className="text-xs text-slate-400 mb-1">Address line 2</div>
                <input value={mailRecipient.addressLine2 ?? ''}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, addressLine2: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <label>
                <div className="text-xs text-slate-400 mb-1">City *</div>
                <input value={mailRecipient.city}
                  onChange={(e) => setMailRecipient({ ...mailRecipient, city: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <div className="text-xs text-slate-400 mb-1">State *</div>
                  <input value={mailRecipient.provinceOrState}
                    onChange={(e) => setMailRecipient({ ...mailRecipient, provinceOrState: e.target.value.toUpperCase().slice(0, 2) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm uppercase" />
                </label>
                <label>
                  <div className="text-xs text-slate-400 mb-1">ZIP *</div>
                  <input value={mailRecipient.postalOrZip}
                    onChange={(e) => setMailRecipient({ ...mailRecipient, postalOrZip: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
                </label>
              </div>
            </div>
            <button onClick={onMail} disabled={mailing}
              className="mt-4 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm">
              {mailing ? 'Mailing…' : 'Render LOI + send via PostGrid'}
            </button>
          </div>
        )}

        {loaded && (
          <div className="space-y-6">
            <Section title="Property & price">
              <Grid cols={4}>
                <Field label="Property address" span={2}>
                  <input
                    className={INPUT}
                    value={dealContext.address}
                    onChange={(e) => setDealContext({ ...dealContext, address: e.target.value })}
                  />
                </Field>
                <Field label="Property name">
                  <input
                    className={INPUT}
                    value={dealContext.name ?? ''}
                    onChange={(e) => setDealContext({ ...dealContext, name: e.target.value })}
                    placeholder="e.g. University Commons"
                  />
                </Field>
                <Field label="Asset class">
                  <select
                    className={INPUT}
                    value={dealContext.assetClass ?? 'unknown'}
                    onChange={(e) =>
                      setDealContext({ ...dealContext, assetClass: e.target.value as AssetClass })
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </Field>
                <Field label="Units">
                  <input
                    type="number"
                    className={INPUT}
                    value={dealContext.units ?? ''}
                    onChange={(e) =>
                      setDealContext({
                        ...dealContext,
                        units: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Purchase price">
                  <input
                    type="number"
                    className={INPUT}
                    value={dealContext.purchasePrice || ''}
                    onChange={(e) =>
                      setDealContext({ ...dealContext, purchasePrice: Number(e.target.value) })
                    }
                    placeholder="0"
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Buyer">
              <Grid cols={2}>
                <Field label="Entity name">
                  <input
                    className={INPUT}
                    value={loi.buyerEntity}
                    onChange={(e) => setLoi({ ...loi, buyerEntity: e.target.value })}
                  />
                </Field>
                <Field label="Contact name">
                  <input
                    className={INPUT}
                    value={loi.buyerContact ?? ''}
                    onChange={(e) => setLoi({ ...loi, buyerContact: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={INPUT}
                    value={loi.buyerEmail ?? ''}
                    onChange={(e) => setLoi({ ...loi, buyerEmail: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={INPUT}
                    value={loi.buyerPhone ?? ''}
                    onChange={(e) => setLoi({ ...loi, buyerPhone: e.target.value })}
                  />
                </Field>
                <Field label="Mailing address" span={2}>
                  <input
                    className={INPUT}
                    value={loi.buyerAddress ?? ''}
                    onChange={(e) => setLoi({ ...loi, buyerAddress: e.target.value })}
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Seller">
              <Grid cols={2}>
                <Field label="Entity name">
                  <input
                    className={INPUT}
                    value={loi.sellerEntity}
                    onChange={(e) => setLoi({ ...loi, sellerEntity: e.target.value })}
                  />
                </Field>
                <Field label="Contact name">
                  <input
                    className={INPUT}
                    value={loi.sellerContact ?? ''}
                    onChange={(e) => setLoi({ ...loi, sellerContact: e.target.value })}
                  />
                </Field>
                <Field label="Mailing address" span={2}>
                  <input
                    className={INPUT}
                    value={loi.sellerAddress ?? ''}
                    onChange={(e) => setLoi({ ...loi, sellerAddress: e.target.value })}
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Timing">
              <Grid cols={4}>
                <Field label="Effective date">
                  <input
                    type="date"
                    className={INPUT}
                    value={loi.effectiveDate}
                    onChange={(e) => setLoi({ ...loi, effectiveDate: e.target.value })}
                  />
                </Field>
                <Field label="Offer expires">
                  <input
                    type="date"
                    className={INPUT}
                    value={loi.expirationDate}
                    onChange={(e) => setLoi({ ...loi, expirationDate: e.target.value })}
                  />
                </Field>
                <Field label="Inspection days">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.inspectionDays}
                    onChange={(e) => setLoi({ ...loi, inspectionDays: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Days to close">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.closingDays}
                    onChange={(e) => setLoi({ ...loi, closingDays: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Title review days">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.titleReviewDays}
                    onChange={(e) => setLoi({ ...loi, titleReviewDays: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Financing days" hint="0 = waived">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.financingDays ?? 0}
                    onChange={(e) =>
                      setLoi({
                        ...loi,
                        financingDays: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Deposits">
              <Grid cols={3}>
                <Field label="Earnest money">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.earnestMoney || ''}
                    onChange={(e) => setLoi({ ...loi, earnestMoney: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Additional deposit (post-DD)">
                  <input
                    type="number"
                    className={INPUT}
                    value={loi.additionalDeposit ?? ''}
                    onChange={(e) =>
                      setLoi({
                        ...loi,
                        additionalDeposit: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Refundable after DD">
                  <select
                    className={INPUT}
                    value={loi.earnestMoneyRefundable ? 'yes' : 'no'}
                    onChange={(e) =>
                      setLoi({ ...loi, earnestMoneyRefundable: e.target.value === 'yes' })
                    }
                  >
                    <option value="yes">Yes — refundable</option>
                    <option value="no">No — non-refundable</option>
                  </select>
                </Field>
              </Grid>
            </Section>

            <Section title="Contingencies & rights">
              <div className="flex flex-wrap gap-3">
                <Toggle
                  checked={loi.inspectionContingency}
                  onChange={(v) => setLoi({ ...loi, inspectionContingency: v })}
                  label="Inspection contingency"
                />
                <Toggle
                  checked={loi.financingContingency}
                  onChange={(v) => setLoi({ ...loi, financingContingency: v })}
                  label="Financing contingency"
                />
                <Toggle
                  checked={loi.assignmentRights}
                  onChange={(v) => setLoi({ ...loi, assignmentRights: v })}
                  label="Assignment rights"
                />
              </div>
            </Section>

            <Section title="Due diligence materials requested">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {DEFAULT_DD_MATERIALS.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 p-1.5 text-sm text-slate-200 cursor-pointer hover:bg-slate-800/50 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={loi.ddMaterials.includes(m)}
                      onChange={() => toggleDd(m)}
                      className="accent-indigo-500"
                    />
                    {m}
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Brokerage & special terms">
              <Field label="Broker fee language">
                <input
                  className={INPUT}
                  value={loi.brokerFee ?? ''}
                  onChange={(e) => setLoi({ ...loi, brokerFee: e.target.value })}
                  placeholder="e.g. Seller to pay 2% to listing broker at closing"
                />
              </Field>
              <Field label="Special provisions">
                <textarea
                  rows={3}
                  className={INPUT}
                  value={loi.specialTerms ?? ''}
                  onChange={(e) => setLoi({ ...loi, specialTerms: e.target.value })}
                  placeholder="Any additional terms not covered above"
                />
              </Field>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state, at }: { state: SaveState; at: Date | null }) {
  const ago = useRelativeTime(at);
  const label = useMemo(() => {
    switch (state) {
      case 'saving':
        return { text: 'Saving…', cls: 'text-slate-400' };
      case 'saved':
        return { text: `Saved ${ago}`, cls: 'text-emerald-400' };
      case 'error':
        return { text: 'Save failed — retry', cls: 'text-rose-400' };
      case 'offline':
        return { text: 'Offline — autosave disabled', cls: 'text-amber-300' };
      default:
        return at ? { text: `Saved ${ago}`, cls: 'text-slate-500' } : null;
    }
  }, [state, ago, at]);
  if (!label) return null;
  return <div className={`text-xs mt-0.5 ${label.cls}`}>{label.text}</div>;
}

// Rerenders label every 15s so "Saved 2m ago" stays current.
function useRelativeTime(d: Date | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return '';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function defaultLoi(): LoiInput {
  const today = new Date();
  const exp = new Date(today);
  exp.setDate(exp.getDate() + 14);
  return {
    buyerEntity: '',
    buyerContact: '',
    sellerEntity: '',
    sellerContact: '',
    effectiveDate: iso(today),
    expirationDate: iso(exp),
    closingDays: 30,
    inspectionDays: 30,
    financingDays: 45,
    earnestMoney: 100_000,
    additionalDeposit: 0,
    earnestMoneyRefundable: true,
    assignmentRights: true,
    financingContingency: true,
    inspectionContingency: true,
    titleReviewDays: 15,
    ddMaterials: [...DEFAULT_DD_MATERIALS],
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---- layout primitives ----

const INPUT =
  'w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-400';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const cls =
    cols === 2 ? 'md:grid-cols-2' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4';
  return <div className={`grid grid-cols-1 ${cls} gap-4`}>{children}</div>;
}

function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span?: number;
  children: React.ReactNode;
}) {
  const cls = span === 2 ? 'md:col-span-2' : '';
  return (
    <label className={`block ${cls}`}>
      <div className="text-xs text-slate-400 mb-1">
        {label}
        {hint && <span className="text-slate-600"> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
        checked
          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
          : 'bg-slate-900/40 border-slate-700 text-slate-400'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

