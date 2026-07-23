import { Link } from 'react-router-dom';

// Land Playbook — the empty-lots wholesaling game plan.
//
// Five steps, mirroring the strategy: find builder-saturated markets, get
// builder buy boxes, contact long-hold vacant-lot owners, contract with
// "and/or assigns" + feasibility exits (zero capital at risk), assign to
// the builder and keep the spread. Structural clone of Playbook.tsx —
// each strategy keeps its own education content.

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
    title: 'Market Research — "Finding the Gold Mine"',
    goal: 'Find areas where builders are actively BUYING — lots of sold lots and fresh construction means demand you can sell into.',
    timeframe: '1–2 evenings per market',
    checklist: [
      'Open the Saturation Map — zones scoring 80+ have the most sold lots + new construction',
      'Cross-check on Zillow: filter Sold + Lots/Land — a wall of yellow dots = builder activity',
      'Flip the Zillow filter to New Construction listings — note which builders\' names keep appearing',
      'Write down the 3–5 zip codes where sold-lot activity clusters — that\'s your farm area',
      'Check price points: what did lots actually sell for? That anchors every number downstream',
    ],
    watchout:
      'A market with cheap lots but NO sold activity is not a gold mine — it\'s a swamp. You make money where builders are already buying, not where land is merely cheap.',
    cta: { label: 'Open the Saturation Map', to: '/app/land/saturation' },
  },
  {
    n: 2,
    title: 'Finding Buyers & Marketing Contracts — "Matchmaking for Profit"',
    goal: 'Get builders to hand you their buy box BEFORE you contract anything — you\'re filling their shopping list, not guessing.',
    timeframe: '1–2 weeks of builder outreach',
    checklist: [
      'From Step 1, list every builder actively buying in your zips (Zillow new-construction listings name them)',
      'Call their acquisition/land manager: "I source off-market lots — what exactly do you buy?"',
      'Capture the FULL buy box: closing terms, desired zip codes, lot requirements, restrictions, and the PRICE they pay per lot',
      'Enter each one under Builder Buy Boxes so every lead auto-matches from now on',
      'Ask every builder: "If I bring you a lot that checks every box, how fast can you close?"',
    ],
    watchout:
      'When you get the builder EXACTLY what they want, they will buy from you all day long. Vague criteria ("we buy lots around Tampa") aren\'t a buy box — push for zips, sizes, and numbers.',
    cta: { label: 'Set up Builder Buy Boxes', to: '/app/land/buy-boxes' },
  },
  {
    n: 3,
    title: 'Seller Outreach & Lead Generation — "Casting the Net"',
    goal: 'Contact the owners most likely to sell at a discount: people who have held vacant land for 10+ years.',
    timeframe: 'Always-on — consistency beats volume',
    checklist: [
      'Run Land Leads with your buy-box zips — the 10+ years-held default is the whole strategy: skip recent purchasers',
      'Prioritize out-of-state and out-of-county owners — they feel taxes and upkeep, not attachment',
      '"No recorded sale" often means decades-held family land — those are gold, not data errors',
      'Parcel data has NO phone numbers: skip-trace or look up the owner, add the phone to the contact, then text',
      'One personal text per lead (the app pre-fills the script) — then log it and set a follow-up',
      'Texting rules: identify yourself, one-to-one messages only, honor STOP instantly, 8am–9pm recipient time',
    ],
    watchout:
      'Never blast. Bulk unsolicited texting violates TCPA and can cost $500–$1,500 per message. Personal, one-at-a-time outreach with instant opt-out honoring is both legal-safer and converts better.',
    cta: { label: 'Find vacant-lot owners', to: '/app/land/leads' },
  },
  {
    n: 4,
    title: 'Agree on Terms & Contract Acquisition — "Securing the Opportunity"',
    goal: 'Lock the lot under contract at a price below the builder\'s buy box — with zero of your own money at risk.',
    timeframe: 'Same day as a "yes" — never let a verbal cool off',
    checklist: [
      'The math: builder pays $70,000 → you offer the owner $60,000 → the $10,000 spread is your fee',
      'You are NOT buying the lot. You sign as "Buyer and/or assigns" and will assign the contract to the builder',
      'Use the 1-page agreement: AS-IS, feasibility-study period (your exit), clear-title clause (your other exit)',
      'Earnest money (if any) is held at the closing agent\'s office — keep it small; the exits make it refundable in practice',
      'Buyer pays ALL title charges, closing fees, recording fees, doc stamps — sellers love hearing they net the full price',
      'EMAIL the contract while you\'re still on the phone (the Contracts page pre-writes the email; attach the PDF) — a photo of a wet signature works too',
      'CC the title company on the contract email so the executed copy lands in escrow from day one',
    ],
    watchout:
      'The feasibility period is your protection — if the builder passes or the title is a mess, you exit clean. But don\'t contract lots you have no matching buy box for; tying up sellers you can\'t perform for burns your name in a small world.',
    cta: { label: 'Generate the 1-page contract', to: '/app/land/contract' },
  },
  {
    n: 5,
    title: 'Closing the Deal & Scaling — "Cashing In"',
    goal: 'Assign the contract to the builder, collect the spread at closing, and turn the process into a machine.',
    timeframe: '2–4 weeks contract-to-close',
    checklist: [
      'Send the contracted lot to the matching builder same-day: parcel ID, size, zip, photos, your assignment price',
      'Generate + email the Assignment of Contract from the Contracts page; your fee is paid at closing by the title company',
      'Email the title company to OPEN ESCROW with both contracts — a neutral third party holding the P&S, the assignment, and all deposits is what protects the deal (and your fee)',
      'Keep the seller warm during the feasibility window — one check-in text per week',
      'Track every deal on the Deal Board: Lead → Offer Sent → Under Contract → Assigned → Closed',
      'After each close, ask the builder: "What else are you looking for?" — their buy box grows, and so does your pipeline',
      'Scale by adding zips and builders, not by cutting corners on the same ones',
    ],
    watchout:
      'Your reputation IS the business. Never shop a contract to other builders after committing it to one, and never re-trade a seller at the closing table. One clean close with one builder is worth more than three messy ones.',
    cta: { label: 'Open the Deal Board', to: '/app/deals' },
  },
];

export default function LandPlaybook() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Land Playbook</h1>
      <p className="text-sm text-gray-500 mb-8 max-w-2xl">
        The empty-lots game plan: find builder-hot markets, collect builder buy boxes, contact
        decade-plus owners, contract with "and/or assigns", assign to the builder, keep the spread.
        You never buy property and never put up money — you execute contracts.
      </p>

      <div className="mb-8 p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Jump to step</div>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <a
              key={s.n}
              href={`#stage-${s.n}`}
              className="text-xs px-2 py-1 rounded-lg border hover:text-blue-300 transition-colors text-gray-300"
              style={{ borderColor: 'var(--border)' }}
            >
              {s.n}. {s.title.split(' — ')[0]}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {STAGES.map((s) => (
          <StageCard key={s.n} stage={s} />
        ))}
      </div>

      <div className="mt-10 p-5 rounded-xl border border-blue-500/30 bg-blue-500/5">
        <h2 className="text-lg font-semibold mb-2">Run the loop</h2>
        <p className="text-sm text-gray-400 mb-4">
          One saturated market + three builder buy boxes + consistent owner outreach = a repeatable
          assignment pipeline. Every step lives in the app:
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/app/land/saturation" className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-semibold">
            1. Saturation Map
          </Link>
          <Link to="/app/land/buy-boxes" className="text-sm px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
            2. Buy Boxes
          </Link>
          <Link to="/app/land/leads" className="text-sm px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
            3. Land Leads
          </Link>
          <Link to="/app/land/contract" className="text-sm px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
            4. Contract
          </Link>
          <Link to="/app/deals" className="text-sm px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
            5. Deal Board
          </Link>
        </div>
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  return (
    <section id={`stage-${stage.n}`} className="p-5 rounded-xl border scroll-mt-8" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-300 font-bold">
          {stage.n}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{stage.title}</h2>
          <p className="text-sm text-gray-300 mt-0.5">{stage.goal}</p>
          <p className="text-xs text-gray-500 mt-1">{stage.timeframe}</p>
        </div>
      </div>

      <div className="pl-14">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Checklist</div>
        <ul className="space-y-1.5 mb-4">
          {stage.checklist.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-300">
              <span className="text-blue-400 flex-shrink-0">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-300 mb-1">Watch out</div>
          <p className="text-sm text-gray-300">{stage.watchout}</p>
        </div>

        {stage.cta && (
          <Link
            to={stage.cta.to}
            className="inline-block text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-medium"
          >
            {stage.cta.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
