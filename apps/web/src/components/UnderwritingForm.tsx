import type {
  AssetClass,
  DealInput,
  UnderwritingInput,
  ValueAddLever,
} from '@mfa/shared';
import { VALUE_ADD_LEVERS, VALUE_ADD_LEVER_LABELS } from '@mfa/shared';

type Props = {
  value: DealInput;
  onChange: (v: DealInput) => void;
};

export default function UnderwritingForm({ value, onChange }: Props) {
  const u = value.underwriting;

  function patchU(partial: Partial<UnderwritingInput>) {
    onChange({ ...value, underwriting: { ...u, ...partial } });
  }
  function patchLoan(partial: Partial<UnderwritingInput['loan']>) {
    onChange({ ...value, underwriting: { ...u, loan: { ...u.loan, ...partial } } });
  }
  function toggleLever(l: ValueAddLever) {
    const cur = value.levers ?? [];
    const next = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l];
    onChange({ ...value, levers: next });
  }

  return (
    <form className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Deal basics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Deal name">
            <input
              type="text"
              value={value.name ?? ''}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="e.g. Broadway Tower — Q2 acquisition"
              className={INPUT}
            />
          </Field>
          <Field label="Asset class">
            <select
              value={value.assetClass ?? ''}
              onChange={(e) =>
                onChange({ ...value, assetClass: (e.target.value || undefined) as AssetClass })
              }
              className={INPUT}
            >
              <option value="">—</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Property</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Purchase price" hint="USD">
            <input
              type="number"
              value={u.purchasePrice || ''}
              onChange={(e) => patchU({ purchasePrice: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Units">
            <input
              type="number"
              value={u.units || ''}
              onChange={(e) => patchU({ units: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Rehab budget" hint="USD (optional)">
            <input
              type="number"
              value={u.rehabBudget ?? ''}
              onChange={(e) =>
                patchU({ rehabBudget: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className={INPUT}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Income / opex</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Current gross rent" hint="annual">
            <input
              type="number"
              value={u.currentGrossRent || ''}
              onChange={(e) => patchU({ currentGrossRent: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Market gross rent" hint="annual, optional">
            <input
              type="number"
              value={u.marketGrossRent ?? ''}
              onChange={(e) =>
                patchU({ marketGrossRent: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className={INPUT}
            />
          </Field>
          <Field label="Vacancy %">
            <input
              type="number"
              step="0.1"
              value={u.vacancyPct ?? ''}
              onChange={(e) => patchU({ vacancyPct: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="OpEx % of EGI">
            <input
              type="number"
              step="0.1"
              value={u.opexPct ?? ''}
              onChange={(e) => patchU({ opexPct: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Loan</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="LTV" hint="0–1 (e.g. 0.65)">
            <input
              type="number"
              step="0.01"
              value={u.loan.ltv ?? ''}
              onChange={(e) => patchLoan({ ltv: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Rate %">
            <input
              type="number"
              step="0.01"
              value={u.loan.ratePct ?? ''}
              onChange={(e) => patchLoan({ ratePct: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Amort years">
            <input
              type="number"
              value={u.loan.amortYears ?? ''}
              onChange={(e) => patchLoan({ amortYears: Number(e.target.value) })}
              className={INPUT}
            />
          </Field>
          <Field label="Interest-only years" hint="optional">
            <input
              type="number"
              value={u.loan.ioYears ?? ''}
              onChange={(e) =>
                patchLoan({ ioYears: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className={INPUT}
            />
          </Field>
          <Field label="Closing costs %" hint="of purchase price, default 2">
            <input
              type="number"
              step="0.1"
              value={u.closingCostsPct ?? ''}
              onChange={(e) =>
                patchU({ closingCostsPct: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className={INPUT}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Value-add levers ({(value.levers ?? []).length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {VALUE_ADD_LEVERS.map((l) => {
            const checked = (value.levers ?? []).includes(l);
            return (
              <label
                key={l}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                  checked
                    ? 'bg-indigo-500/10 border-indigo-500/40'
                    : 'bg-slate-900/40 border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLever(l)}
                  className="accent-indigo-500"
                />
                <span className="text-sm text-slate-200">{VALUE_ADD_LEVER_LABELS[l]}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Notes</h3>
        <textarea
          rows={3}
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          className={`${INPUT} font-mono text-xs`}
          placeholder="Broker, seller motivation, T12 caveats, etc."
        />
      </section>
    </form>
  );
}

const INPUT =
  'w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-400';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-slate-400 mb-1">
        {label}
        {hint && <span className="text-slate-600"> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}
