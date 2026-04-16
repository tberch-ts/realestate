import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DealInput, LoiInput } from '@mfa/shared';
import { downloadLoi, fetchDeal } from '../lib/api';

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

export default function Loi() {
  const [params] = useSearchParams();
  const dealId = params.get('dealId');
  const [deal, setDeal] = useState<DealInput | null>(null);
  const [dealError, setDealError] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiInput>(() => defaultLoi());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) {
      setDealError('No dealId in URL. Save a deal first and click "Generate LOI" from the deal page.');
      return;
    }
    fetchDeal(Number(dealId))
      .then((d) => setDeal(d))
      .catch((e: Error) => setDealError(e.message));
  }, [dealId]);

  async function onDownload() {
    if (!deal) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadLoi(deal, loi);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  function toggleDd(item: string) {
    const has = loi.ddMaterials.includes(item);
    setLoi({
      ...loi,
      ddMaterials: has ? loi.ddMaterials.filter((x) => x !== item) : [...loi.ddMaterials, item],
    });
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/deals" className="text-sm text-indigo-400 hover:text-indigo-300">
              ← Deals
            </Link>
            <h1 className="text-3xl font-bold mt-2">Letter of Intent</h1>
            <p className="text-slate-400 text-sm mt-1">
              {deal?.address ?? dealError ?? 'Loading…'}
            </p>
          </div>
          <button
            onClick={onDownload}
            disabled={!deal || downloading}
            className="px-5 py-2 rounded bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 font-semibold text-white"
          >
            {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        {dealError && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-6">
            {dealError}
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-6">
            {error}
          </div>
        )}

        {deal && (
          <div className="space-y-6">
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
