import type { UnderwritingOutput } from '@mfa/shared';

export default function UnderwritingResults({ out }: { out: UnderwritingOutput }) {
  const capOk = out.capRatePct >= 5;
  const dscrOk = out.dscr >= 1.25;
  const cocOk = out.cashOnCashPct >= 7;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
        Underwriting (Year 1)
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Kpi label="Cap rate" value={pct(out.capRatePct)} good={capOk} target="≥ 5%" />
        <Kpi label="DSCR" value={out.dscr.toFixed(2)} good={dscrOk} target="≥ 1.25" />
        <Kpi
          label="Cash-on-cash"
          value={pct(out.cashOnCashPct)}
          good={cocOk}
          target="≥ 7%"
        />
        <Kpi
          label="Break-even occ."
          value={pct(out.breakEvenOccupancyPct)}
          good={out.breakEvenOccupancyPct < 85}
          target="< 85%"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <Row k="Price / unit" v={money(out.pricePerUnit)} />
        <Row k="Loan amount" v={money(out.loanAmount)} />
        <Row k="Gross scheduled rent" v={money(out.grossScheduledRent)} />
        <Row k="Equity required" v={money(out.equityRequired)} />
        <Row k="Effective gross income" v={money(out.effectiveGrossIncome)} />
        <Row k="Monthly debt service" v={money(out.monthlyDebtService)} />
        <Row k="Operating expenses" v={money(out.operatingExpenses)} />
        <Row k="Annual debt service" v={money(out.annualDebtService)} />
        <Row k="Net operating income" v={money(out.netOperatingIncome)} strong />
        <Row k="Cash flow (year 1)" v={money(out.cashFlow)} strong />
        {out.lossToLeasePct != null && (
          <Row k="Loss to lease" v={pct(out.lossToLeasePct)} />
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  good,
  target,
}: {
  label: string;
  value: string;
  good: boolean;
  target: string;
}) {
  return (
    <div
      className={`p-3 rounded border ${
        good ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'
      }`}
    >
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${good ? 'text-emerald-300' : 'text-rose-300'}`}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">target {target}</div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-800/60 py-1">
      <span className="text-slate-500">{k}</span>
      <span className={strong ? 'text-slate-100 font-semibold' : 'text-slate-200'}>{v}</span>
    </div>
  );
}

function money(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}
