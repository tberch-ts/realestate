import type { BuyBoxOutcome, BuyBoxResult } from '@mfa/shared';

const DOT: Record<BuyBoxOutcome, string> = {
  pass: 'bg-emerald-500',
  fail: 'bg-rose-500',
  borderline: 'bg-amber-500',
  unknown: 'bg-slate-500',
};

const BANNER: Record<BuyBoxOutcome, { bg: string; text: string; label: string }> = {
  pass: { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300', label: 'PURSUE' },
  borderline: { bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-200', label: 'BORDERLINE' },
  fail: { bg: 'bg-rose-500/20 border-rose-500/40', text: 'text-rose-300', label: 'PASS' },
  unknown: { bg: 'bg-slate-700/40 border-slate-600/50', text: 'text-slate-300', label: 'INSUFFICIENT DATA' },
};

export default function BuyBoxCard({ buyBox }: { buyBox: BuyBoxResult }) {
  const banner = BANNER[buyBox.outcome];
  return (
    <section className={`rounded-xl border ${banner.bg} p-5 mb-6`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-slate-400">BUY BOX</h2>
          <p className={`text-2xl font-bold ${banner.text}`}>{banner.label}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Score</div>
          <div className="text-4xl font-bold text-slate-100">{buyBox.score}</div>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {buyBox.criteria.map((c) => (
          <li key={c.criterion} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[c.outcome]}`} />
            <div className="flex-1">
              <div className="flex justify-between">
                <span className="text-slate-200">{c.label}</span>
                <span className="text-slate-400 text-xs">{c.actual ?? '—'}</span>
              </div>
              {c.note && <div className="text-xs text-slate-500">{c.note}</div>}
            </div>
          </li>
        ))}
      </ul>

      {buyBox.whyPass.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <h4 className="text-xs font-semibold text-rose-300 mb-1">Why pass</h4>
          <ul className="text-sm text-slate-300 list-disc list-inside space-y-0.5">
            {buyBox.whyPass.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {buyBox.whyPursue.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <h4 className="text-xs font-semibold text-emerald-300 mb-1">Why pursue</h4>
          <ul className="text-sm text-slate-300 list-disc list-inside space-y-0.5">
            {buyBox.whyPursue.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
