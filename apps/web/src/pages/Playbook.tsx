import { Link } from 'react-router-dom';

/**
 * Playbook — "You underwrote it. Now what?"
 *
 * A field guide for putting a multifamily deal together, organized by stage.
 * Each stage links back into the relevant part of the app (LOI, follow-ups,
 * deal table, etc.) so the guide doubles as a navigation shortcut.
 *
 * Intentionally opinionated — these are the tips we've found bite people most
 * often on small/mid multifamily deals. Edit freely as lessons accumulate.
 */

type Stage = {
  n: number;
  title: string;
  goal: string;
  timeframe: string;
  checklist: string[];
  watchout: string;
  cta?: { label: string; to: string };
};

const STAGES: Stage[] = [
  {
    n: 1,
    title: 'Source & screen',
    goal: 'Find deals worth underwriting — don\'t waste your buy box on noise.',
    timeframe: 'Always-on',
    checklist: [
      'Pull the deal-zone map and filter for score 80+ neighborhoods',
      'Build a target list of out-of-state owners (tired LP money turns over)',
      'Track SEC Form D filings for sponsors raising in your market',
      'Log every cold call and broker convo as a contact with a follow-up date',
    ],
    watchout:
      'Chasing listings on LoopNet means competing with everyone. Off-market conversations beat it 10:1 on price — but only if you\'re consistent about follow-up.',
    cta: { label: 'Open the hotspot map', to: '/hotspots' },
  },
  {
    n: 2,
    title: 'Underwrite the property',
    goal: 'Get to a number you\'d actually pay, with defensible assumptions.',
    timeframe: '30–90 minutes per deal',
    checklist: [
      'Pull T12 and current rent roll before you commit to numbers',
      'Vacancy: use trailing 90-day actuals, not the 5% rule of thumb',
      'OpEx: expect 40–50% of EGI for older C-class; 30–35% for newer B+',
      'Underwrite in-place AND pro-forma — the delta is your value-add thesis',
      'Stress-test with +100bps on the loan and −10% on market rent',
    ],
    watchout:
      'If you can\'t explain the top-3 assumptions to an LP in one sentence each, you don\'t understand the deal yet. Don\'t make an offer until you can.',
    cta: { label: 'Run an underwrite', to: '/deal' },
  },
  {
    n: 3,
    title: 'Tour & verify',
    goal: 'Ground-truth everything you assumed. Kill bad deals before LOI.',
    timeframe: '1–3 days after underwrite',
    checklist: [
      'Walk every vacant unit and at least 20% of occupied units',
      'Photograph roof, mechanicals, parking lot, and any deferred maintenance',
      'Pull 5 comps within 0.5 miles — Zillow, Apartments.com, CoStar if you have it',
      'Drive the neighborhood at 8pm on a weekday',
      'Sanity-check the rent roll: any rents above-market? Concessions hidden?',
    ],
    watchout:
      'A pretty exterior with 70% occupancy is a red flag — it almost always means management or tenant-mix problems you\'ll inherit. Ask why.',
  },
  {
    n: 4,
    title: 'Letter of Intent (LOI)',
    goal: 'Lock terms on paper with enough optionality to back out.',
    timeframe: '1–3 days to draft + negotiate',
    checklist: [
      'Purchase price tied to a gross rent multiplier or cap — show your math',
      'Earnest money: 1% is standard, refundable through DD',
      'Due diligence period: 30 days minimum for sub-50-unit, 45–60 for larger',
      'Closing: 30 days post-DD is tight but common; push to 45 if financing',
      'Include "subject to lender approval" and "subject to partner approval"',
    ],
    watchout:
      'Non-refundable earnest money before DD is complete is a no. If the seller insists, walk — someone else has a better deal for them, or they\'re hiding something.',
    cta: { label: 'Generate an LOI', to: '/loi' },
  },
  {
    n: 5,
    title: 'PSA (Purchase & Sale Agreement)',
    goal: 'Convert the LOI into a binding contract without giving up your outs.',
    timeframe: '3–10 days of attorney back-and-forth',
    checklist: [
      'Use a real estate attorney — not a GP buddy, not ChatGPT alone',
      'Reps & warranties: occupancy, operating history, no pending litigation',
      'Survive-closing clauses for anything material (env, title defects)',
      'Assignment language — you\'ll want to assign into an SPE at closing',
      'Clear delivery-of-documents list with firm deadlines on the seller',
    ],
    watchout:
      'Sellers love to slip in "AS-IS, WHERE-IS, with all faults" and call it standard. It is standard — but only if your DD period is long enough to find the faults.',
  },
  {
    n: 6,
    title: 'Due diligence',
    goal: 'Verify every number and every liability. Re-trade if you find gaps.',
    timeframe: '30–60 days',
    checklist: [
      'T12 tie-out against bank statements — not just seller-provided P&L',
      'Rent roll: confirm every lease, every concession, every security deposit',
      'Third-party property condition report (PCR) + Phase I environmental',
      'Unit-by-unit interior inspection — budget for what you find',
      'Title commitment + ALTA survey — flag easements, encroachments',
      'Municipal search: open permits, code violations, pending assessments',
    ],
    watchout:
      'If DD reveals >3% cost delta vs. underwriting, you have leverage to re-trade. Most buyers don\'t use it. Use it.',
  },
  {
    n: 7,
    title: 'Debt & equity',
    goal: 'Lock in a lender and close your capital stack before DD expires.',
    timeframe: 'Runs in parallel with DD',
    checklist: [
      'Get 3 lender quotes — agency, bank, debt fund — compare LTV, rate, IO, prepay',
      'Lock the rate when you\'re comfortable; float if curve is falling',
      'Appraisal ordered early — lender-ordered, 2–4 week turnaround',
      'If syndicating: PPM to attorney, 506(b) or 506(c), investor soft commits',
      'Verify insurance quotes — premiums have doubled in many markets since 2022',
    ],
    watchout:
      'Lender "soft quotes" are not commitments. Nothing is real until you have a signed term sheet AND a clear-to-close. Build a 2-week buffer for underwriting surprises.',
  },
  {
    n: 8,
    title: 'Closing',
    goal: 'Fund and record. Don\'t let the deal die at the 1-yard line.',
    timeframe: '1–3 days at the closing table',
    checklist: [
      'Final walk-through the day before — confirm condition matches PCR',
      'Settlement statement review line-by-line — prorations, credits, HOA',
      'Wire instructions verified by phone before sending funds (wire fraud is rampant)',
      'Deed, bill of sale, assignment of leases, estoppels all signed & recorded',
      'Insurance binder effective 12:01am the day of closing',
    ],
    watchout:
      'Never wire money based on emailed instructions alone. Call the title company directly at a number you looked up independently. We\'ve seen six-figure losses from fake wire instruction emails.',
  },
  {
    n: 9,
    title: 'Take-over (Day 1–30)',
    goal: 'Secure the property, tenants, and cash. Don\'t break anything.',
    timeframe: 'First 30 days post-close',
    checklist: [
      'Day 1 letter to tenants: new ownership, where to pay, who to call',
      'Rekey all common areas + any vacant units',
      'Utility transfers — don\'t let electric lapse at 11pm',
      'Set up bank accounts, property management software, rent collection',
      'Lender reporting schedule entered into calendar — monthly/quarterly',
      'Schedule kickoff with property manager (even if self-managing)',
    ],
    watchout:
      'Sellers often "forget" to transfer security deposits or prorate rents correctly. Check the settlement statement against actual bank balances in week 1.',
    cta: { label: 'Track take-over follow-ups', to: '/followup' },
  },
  {
    n: 10,
    title: 'Execute & exit',
    goal: 'Hit the value-add thesis, then harvest — refi, supplemental, or sale.',
    timeframe: 'Months 6–60',
    checklist: [
      'Track actuals vs. underwriting monthly — delta is your board-meeting story',
      'Rent increases: push in-place leases to market as they roll (60-day notice)',
      'CapEx: phase work to avoid occupancy hits > 10% at any time',
      'Watch DSCR — refinance trigger is usually 1.30 + seasoning (12 mo)',
      'Reassess exit annually: hold 5 yrs? Supplemental? 1031 into next deal?',
    ],
    watchout:
      'Most small multifamily operators over-hold. If you\'ve hit your return targets and the market is strong, sell or refi — don\'t fall in love with the building.',
  },
];

export default function Playbook() {
  return (
    <div className="min-h-screen px-6 py-10 bg-slate-950 text-slate-200">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-2">
          <Link to="/" className="text-sm text-slate-400 hover:text-indigo-300">
            ← Home
          </Link>
        </div>
        <h1 className="text-4xl font-bold mb-3">Deal Playbook</h1>
        <p className="text-slate-400 mb-10 max-w-2xl">
          You underwrote a property. What now? This is the field guide — 10
          stages from first tour through exit, with tips, checklists, and the
          watch-outs that bite first-time sponsors.
        </p>

        {/* Quick nav */}
        <div className="mb-10 p-4 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Jump to stage
          </div>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <a
                key={s.n}
                href={`#stage-${s.n}`}
                className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:border-indigo-400 hover:text-indigo-300 text-slate-300"
              >
                {s.n}. {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* Stages */}
        <div className="space-y-6">
          {STAGES.map((s) => (
            <StageCard key={s.n} stage={s} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 p-5 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
          <h2 className="text-lg font-semibold text-slate-100 mb-2">
            Ready for the next deal?
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            The best time to source the next deal is right after closing the
            current one — your underwriting muscles are warm and your network
            just saw you close.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="text-sm px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold"
            >
              Analyze a new address
            </Link>
            <Link
              to="/hotspots"
              className="text-sm px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-indigo-400 text-slate-200"
            >
              Browse hot zones
            </Link>
            <Link
              to="/deals"
              className="text-sm px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-indigo-400 text-slate-200"
            >
              Saved deals
            </Link>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-10">
          Playbook v1.0 · Edit <code className="text-slate-400">apps/web/src/pages/Playbook.tsx</code> to
          refine tips as lessons accumulate.
        </p>
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  return (
    <section
      id={`stage-${stage.n}`}
      className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 scroll-mt-8"
    >
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold">
          {stage.n}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-100">{stage.title}</h2>
          <p className="text-sm text-slate-300 mt-0.5">{stage.goal}</p>
          <p className="text-xs text-slate-500 mt-1">⏱ {stage.timeframe}</p>
        </div>
      </div>

      <div className="pl-14">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Checklist
        </div>
        <ul className="space-y-1.5 mb-4">
          {stage.checklist.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-300">
              <span className="text-indigo-400 flex-shrink-0">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-300 mb-1">
            Watch out
          </div>
          <p className="text-sm text-slate-300">{stage.watchout}</p>
        </div>

        {stage.cta && (
          <Link
            to={stage.cta.to}
            className="inline-block text-sm text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            {stage.cta.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
