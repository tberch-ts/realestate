import { Link } from 'react-router-dom'
import {
  Building2, FileText, TrendingUp,
  GraduationCap, ListChecks, DollarSign, Zap, Check,
  ArrowRight, MapPin, Shield, Database, ChevronDown, Star,
  Search, Calculator, Kanban,
} from 'lucide-react'
import { useState } from 'react'
import { PLAN_TIERS, PLAN_ORDER } from '../types/plan'

// ── Features ─────────────────────────────────────────────────────────────────
// Order leads with lead-finding (scoring, hotspot map, property search,
// market intel), then the close-the-deal toolkit.

const FEATURES = [
  {
    icon: Zap, color: '#ef4444',
    title: 'Deal Scoring Engine',
    sub: 'Weighted 0–100 opportunity score',
    body: 'Every area and deal gets an automated score blending public data with underwriting metrics (cap rate, DSCR, CoC) and market signals. Sort by score — highest upside floats to the top.',
  },
  {
    icon: MapPin, color: '#f97316',
    title: 'Hotspot Map',
    sub: 'Every neighborhood rated, 6 metros',
    body: 'Color-coded map of every neighborhood in Phoenix, Nashville, Charlotte, Raleigh, Tampa, and Austin — scored by median income, rent, density, and rent burden. Click any zone for property candidates.',
  },
  {
    icon: Search, color: '#3b82f6',
    title: 'Property Search',
    sub: 'Instant data on any address',
    body: 'Enter any address in your market and get assessed value, unit count, lot size, year built, zoning, and assessor data in seconds — no county portal logins required.',
  },
  {
    icon: TrendingUp, color: '#f59e0b',
    title: 'Market Intelligence',
    sub: 'Live macro signals per MSA',
    body: 'Treasury yields, CPI, local unemployment, and cap rate trends pulled live from FRED and BLS. Know whether the macro environment favors buyers or sellers today.',
  },
  {
    icon: Calculator, color: '#8b5cf6',
    title: 'Underwriting Calculator',
    sub: 'Full Year-1 pro-forma in one form',
    body: 'Cap rate, NOI, DSCR, cash-on-cash return, break-even occupancy. Enter asking price, rents, and loan terms — results update instantly, saveable per deal.',
  },
  {
    icon: Kanban, color: '#06b6d4',
    title: 'Deal Pipeline',
    sub: '7-stage kanban from lead to close',
    body: 'Drag deals across Sourcing → LOI → Due Diligence → Financing → Closing → Closed. Real-time sync keeps your whole team on the same board.',
  },
  {
    icon: FileText, color: '#10b981',
    title: 'LOI Builder',
    sub: 'Professional letter of intent in minutes',
    body: 'Fill the form, click generate. Get a formatted LOI pre-populated from your deal data. Copy to clipboard or save as draft — linked to the deal record.',
  },
  {
    icon: DollarSign, color: '#a855f7',
    title: 'Capital Raise Tracker',
    sub: 'LP funnel from verbal to funded',
    body: 'Track LP commitments through 4 stages: verbal → soft commit → signed → funded. See total equity raised, remaining gap, and a per-deal progress bar at a glance.',
  },
  {
    icon: ListChecks, color: '#14b8a6',
    title: '11-Phase Syndication Pipeline',
    sub: 'Checklist from foundation to post-close',
    body: 'A structured checklist covering every phase of a syndication — entity setup, PSA, due diligence, securities, financing, close, and post-close asset management.',
  },
  {
    icon: GraduationCap, color: '#64748b',
    title: 'Learn A→Z',
    sub: 'Built-in syndication course',
    body: 'Full self-paced course covering multifamily fundamentals through asset management. Each module is locked until the prior phase is complete. Pro plan unlocks all content.',
  },
]

const DATA_SOURCES = [
  { name: 'County Assessors', desc: 'Property records, unit counts, assessed values — all 6 markets' },
  { name: 'Census ACS', desc: 'Median income, rent, rent burden by tract' },
  { name: 'HUD FMR', desc: 'Fair market rents by bedroom count + MSA' },
  { name: 'FRED / BLS', desc: 'Treasury rates, CPI, local unemployment' },
  { name: 'Google Maps', desc: 'Satellite view, neighborhood polygon boundaries' },
  { name: 'SaaS rent & comp feeds', desc: 'Rent comps and cap rate benchmarks via licensed APIs' },
]

const MARKETS_LIVE = ['Phoenix', 'Nashville', 'Charlotte', 'Raleigh', 'Tampa', 'Austin']

const STEPS = [
  {
    n: '01', color: '#3b82f6',
    title: 'Find leads on a scored map',
    body: 'Every neighborhood in your market is rated 0–100 from public and market data — income, rents, rent burden, density. The highest-upside zones and property candidates surface on their own.',
  },
  {
    n: '02', color: '#8b5cf6',
    title: 'Underwrite in the same tab',
    body: 'Assessor data is already in front of you. Fill the underwriting form — cap rate, NOI, DSCR, and cash-on-cash update instantly. Save the output directly to the deal record.',
  },
  {
    n: '03', color: '#10b981',
    title: 'Close the deal',
    body: 'One click generates a professional LOI. Move the deal through your 7-stage pipeline, track LP commitments, and manage syndication tasks — all the way to close.',
  },
]

const FIND_LIST = [
  { name: 'Deal scoring engine', desc: 'weighted 0–100 score on every deal' },
  { name: 'Hotspot map', desc: 'every neighborhood rated, in 6 metros' },
  { name: 'Property search', desc: 'assessor data on any address, instantly' },
  { name: 'Market intelligence', desc: 'live macro signals per MSA' },
]

const CLOSE_LIST = [
  { name: 'Underwriting calculator', desc: 'full Year-1 pro-forma in one form' },
  { name: 'LOI builder', desc: 'professional letter of intent in minutes' },
  { name: 'Deal pipeline + CRM', desc: '7-stage kanban from lead to close' },
  { name: 'Capital raise + syndication', desc: 'LP funnel and 11-phase checklist' },
]

const FAQS = [
  {
    q: 'Which markets are covered?',
    a: 'Area scoring, the hotspot map, and property search are live in six metros: Phoenix, Nashville, Charlotte, Raleigh, Tampa, and Austin — with more markets on the roadmap. Market intel, the LOI builder, pipeline, CRM, and underwriting tools work for any market.',
  },
  {
    q: 'Is this a CRM, an underwriting tool, or a leads platform?',
    a: 'All of it — that’s the point. SmartInvestorCRM is the complete deal maker: a scoring system built on public and SaaS data finds your leads, and the underwriting, pipeline, CRM, LOI, and capital raise tools close them. One platform from scored map to signed close.',
  },
  {
    q: 'How does the scoring system work?',
    a: 'Every neighborhood is rated from public data — median income, rents, rent burden, population density — and every deal gets a weighted 0–100 score blending underwriting metrics (cap rate, DSCR, cash-on-cash) with live market signals. Scores update as the data does.',
  },
  {
    q: 'How does billing work?',
    a: 'Monthly subscriptions via Stripe. You can upgrade, downgrade, or cancel at any time from the billing portal. Cancellation is instant and takes effect at the end of the current billing period — no pro-rated penalties.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your account is immediately downgraded to the Free tier. Your deals, contacts, and LOIs are preserved — you just lose access to Pro/Team features. Data deletion requires you to explicitly request it.',
  },
  {
    q: 'Can multiple people use the same account?',
    a: 'The Team plan ($199/mo) supports up to 5 team members per deal with a shared deal board and collaborative pipeline checklist. Individual plans are single-user.',
  },
  {
    q: 'How is my data secured?',
    a: 'Firebase Auth handles authentication (Google sign-in or email/password). All deal data lives in Firestore with security rules scoped to the authenticated user. Payments are handled entirely by Stripe — we never store card data.',
  },
]

// ── Landing ───────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)', color: '#f9fafb' }}>
      <Nav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <FindCloseSplit />
      <Features />
      <DataSources />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 border-b"
      style={{ borderColor: 'var(--border)', background: 'rgba(10,14,23,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-center gap-2">
        <Building2 size={18} className="text-blue-400" />
        <span className="font-bold tracking-tight">SmartInvestorCRM</span>
      </div>

      <div className="hidden md:flex items-center gap-6">
        <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How it works</a>
        <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</a>
        <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</a>
        <a href="#faq" className="text-sm text-gray-400 hover:text-white transition-colors">FAQ</a>
      </div>

      <div className="flex items-center gap-3">
        <Link to="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors hidden md:block">
          Sign in
        </Link>
        <Link
          to="/sign-up"
          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          Start free
        </Link>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const LEADERBOARD = [
  { name: 'Grant Park · PHX', score: 94, color: '#10b981' },
  { name: 'Antioch · BNA', score: 91, color: '#10b981' },
  { name: 'NoDa · CLT', score: 87, color: '#3b82f6' },
  { name: 'Seminole Hts · TPA', score: 84, color: '#3b82f6' },
  { name: 'East Austin · AUS', score: 79, color: '#f59e0b' },
]

function Hero() {
  return (
    <section
      className="px-6 md:px-10 pt-20 pb-22 max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center"
    >
      <div className="text-center lg:text-left">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs text-blue-400 mb-7"
          style={{ borderColor: 'rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.08)' }}
        >
          <Zap size={11} />
          The Complete Deal Maker
        </div>

        <h1 className="text-5xl md:text-[60px] font-bold tracking-tight leading-[1.08] mb-6" style={{ letterSpacing: '-0.025em' }}>
          From scored lead<br />
          <span style={{ color: '#3b82f6' }}>to signed close.</span>
        </h1>

        <p className="text-lg md:text-[19px] text-gray-400 mx-auto lg:mx-0 mb-3.5 leading-relaxed max-w-[560px]">
          SmartInvestorCRM scores every neighborhood and property with public and market data —
          so the leads come to you. Then it hands you the underwriting calculator, deal pipeline,
          LOI builder, CRM, and capital raise tracker to take each one to a signed close.
        </p>

        <p className="text-sm text-gray-500 mb-6">
          One score to find the deal. One dashboard to close it.
        </p>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-8">
          <span className="text-[11px] uppercase tracking-wider text-gray-600 mr-1">Live in 6 markets</span>
          {MARKETS_LIVE.map((m) => (
            <span
              key={m}
              className="px-2.5 py-1 rounded-full border text-xs text-gray-300"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              {m}
            </span>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-4">
          <Link
            to="/sign-up"
            className="flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-base bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Start for free <ArrowRight size={16} />
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 px-7 py-3.5 rounded-lg font-medium text-base border hover:border-gray-500 transition-colors"
            style={{ borderColor: 'var(--border)' }}
          >
            See how it works <ChevronDown size={16} />
          </a>
        </div>
        <p className="text-xs text-gray-600">No credit card required · Free plan includes 1 active deal · Cancel anytime</p>
      </div>

      {/* Terminal deal dashboard */}
      <div
        className="rounded-2xl border p-5 text-left font-mono text-xs"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="ml-2 text-gray-600">SmartInvestorCRM — Deal Dashboard</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-[18px]">
          {[
            { label: 'MARKETS SCORED', val: '6', color: '#3b82f6' },
            { label: 'AVG DEAL SCORE', val: '81/100', color: '#10b981' },
            { label: 'PIPELINE VALUE', val: '$18.2M', color: '#f59e0b' },
            { label: 'LP COMMITTED', val: '$3.1M', color: '#8b5cf6' },
          ].map(({ label, val, color }) => (
            <div key={label} className="rounded-[10px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
              <p className="text-gray-600 text-[11px] mb-0.5">{label}</p>
              <p className="text-2xl font-bold" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>

        <p className="text-gray-600 text-[11px] mb-2 tracking-wide">TOP SCORED AREAS — THIS WEEK</p>
        <div className="flex flex-col gap-2">
          {LEADERBOARD.map(({ name, score, color }) => (
            <div key={name} className="grid items-center gap-2.5" style={{ gridTemplateColumns: '150px 1fr 44px' }}>
              <span className="text-gray-300 truncate">{name}</span>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full" style={{ width: `${score}%`, background: color }} />
              </div>
              <span className="font-bold text-right" style={{ color }}>{score}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-gray-600">Scores refresh nightly from public + SaaS feeds</span>
          <Link to="/app/hotspots" className="text-blue-400 hover:text-blue-300">View hotspot map →</Link>
        </div>
      </div>
    </section>
  )
}

// ── Trust strip ───────────────────────────────────────────────────────────────

function TrustStrip() {
  return (
    <div className="border-y py-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-8">
        {[
          { icon: <Database size={14} className="text-blue-400" />,  label: 'Public + SaaS data, live', sub: 'County assessors · Census ACS · HUD FMR · FRED' },
          { icon: <Star    size={14} className="text-amber-400" />, label: '6 markets scored', sub: 'Phoenix · Nashville · Charlotte · Raleigh · Tampa · Austin' },
          { icon: <Shield  size={14} className="text-green-400" />, label: 'Enterprise-grade auth', sub: 'Firebase Auth · Firestore security rules' },
          { icon: <Zap     size={14} className="text-purple-400" />, label: 'Stripe billing', sub: 'Cancel anytime · No annual lock-in' },
        ].map(({ icon, label, sub }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm">
            {icon}
            <div>
              <p className="font-medium text-white">{label}</p>
              <p className="text-xs text-gray-500">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 md:px-10 py-24 max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-3">Scored lead → signed close</h2>
      <p className="text-gray-400 text-center mb-16">Three steps. One tab. No spreadsheets.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {/* connector line */}
        <div className="hidden md:block absolute top-8 left-[calc(16.6%+1rem)] right-[calc(16.6%+1rem)] h-px"
          style={{ background: 'linear-gradient(90deg, var(--border) 0%, var(--border) 100%)' }}
        />
        {STEPS.map(({ n, color, title, body }) => (
          <div key={n} className="flex flex-col items-center text-center md:items-start md:text-left">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 font-mono font-bold text-xl shrink-0 relative z-10"
              style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
            >
              {n}
            </div>
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Find / Close toolkit split ──────────────────────────────────────────────

function FindCloseSplit() {
  return (
    <section className="border-y py-24 px-6 md:px-10" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-3">The complete toolkit — both halves of the deal</h2>
        <p className="text-gray-400 text-center mb-12">
          Most tools do one or the other. SmartInvestorCRM is built to do both.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            className="rounded-xl p-7 border"
            style={{ borderColor: 'rgba(59,130,246,0.3)', background: 'var(--bg-card)' }}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.09)', color: '#3b82f6' }}>
                <Search size={18} />
              </div>
              <h3 className="text-xl font-bold" style={{ color: '#3b82f6' }}>Find leads</h3>
            </div>
            <p className="text-[13px] text-gray-500 mb-5">A scoring system that surfaces the deals worth chasing.</p>
            <div className="flex flex-col gap-3">
              {FIND_LIST.map(({ name, desc }) => (
                <div key={name} className="flex items-start gap-2.5 text-sm text-gray-300">
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: '#3b82f6' }} strokeWidth={2.5} />
                  <span><strong className="text-white">{name}</strong> — {desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl p-7 border"
            style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'var(--bg-card)' }}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.09)', color: '#10b981' }}>
                <FileText size={18} />
              </div>
              <h3 className="text-xl font-bold" style={{ color: '#10b981' }}>Close deals</h3>
            </div>
            <p className="text-[13px] text-gray-500 mb-5">Every tool between the lead and the signature.</p>
            <div className="flex flex-col gap-3">
              {CLOSE_LIST.map(({ name, desc }) => (
                <div key={name} className="flex items-start gap-2.5 text-sm text-gray-300">
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: '#10b981' }} strokeWidth={2.5} />
                  <span><strong className="text-white">{name}</strong> — {desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features() {
  return (
    <section id="features" className="px-6 md:px-10 py-24 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-3">10 tools. One dashboard.</h2>
      <p className="text-gray-400 text-center mb-14">
        Replace your fragmented stack — no more flipping between data tools, Excel, Word, and Dropbox.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, color, title, sub, body }) => (
          <div
            key={title}
            className="rounded-xl border p-5 hover:border-gray-600 transition-colors flex flex-col"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${color}18`, color }}
              >
                <Icon size={18} />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">{title}</p>
                <p className="text-xs leading-tight" style={{ color }}>{sub}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed flex-1">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Data Sources ──────────────────────────────────────────────────────────────

function DataSources() {
  return (
    <section className="border-y py-16 px-6 md:px-10" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-2">Built on real public + SaaS data</h2>
        <p className="text-gray-400 text-center text-sm mb-10">
          Not scraped aggregators. Live pulls from government, institutional, and licensed sources.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DATA_SOURCES.map(({ name, desc }) => (
            <div
              key={name}
              className="rounded-lg border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <p className="font-semibold text-sm mb-0.5 text-blue-300">{name}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <section id="pricing" className="px-6 md:px-10 py-24 max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-3">Simple, transparent pricing</h2>
      <p className="text-gray-400 text-center mb-4">
        Start free — no credit card. Upgrade when you're ready to run full deals.
      </p>
      <p className="text-center text-xs text-gray-600 mb-12">
        All paid plans via Stripe. Cancel anytime from the billing portal.
      </p>
      <PricingGrid />
    </section>
  )
}

// ── Pricing grid (shared between Landing + Pricing page) ─────────────────────

export function PricingGrid({ currentPlan, onUpgrade }: {
  currentPlan?: string
  onUpgrade?: (planId: string) => Promise<void>
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLAN_ORDER.map((planId) => {
        const tier = PLAN_TIERS[planId]
        const isCurrent = currentPlan === planId
        const isFree = planId === 'free'
        const isPaid = !isFree

        return (
          <div
            key={planId}
            className="relative rounded-xl border flex flex-col"
            style={{
              background: 'var(--bg-card)',
              borderColor: tier.badge ? tier.color : 'var(--border)',
              boxShadow: tier.badge ? `0 0 24px ${tier.color}18` : undefined,
            }}
          >
            {tier.badge && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: tier.color, color: '#fff' }}
              >
                {tier.badge}
              </div>
            )}

            <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="font-bold text-lg" style={{ color: tier.color }}>{tier.name}</p>
              <div className="flex items-end gap-1 mt-1 mb-1">
                <span className="mono font-bold text-3xl">${tier.price}</span>
                <span className="text-gray-500 text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-gray-500">{tier.tagline}</p>
            </div>

            <ul className="flex-1 p-5 space-y-2">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check size={12} className="mt-0.5 shrink-0" style={{ color: tier.color }} />
                  {f}
                </li>
              ))}
            </ul>

            <div className="p-4">
              {isCurrent ? (
                <div
                  className="w-full py-2 rounded-lg text-center text-sm font-medium border"
                  style={{ borderColor: tier.color, color: tier.color }}
                >
                  Current plan
                </div>
              ) : isFree ? (
                <Link
                  to="/sign-up"
                  className="block w-full py-2 rounded-lg text-center text-sm font-medium border hover:bg-white/5 transition-colors"
                  style={{ borderColor: 'var(--border)', color: '#f9fafb' }}
                >
                  Get started free
                </Link>
              ) : onUpgrade ? (
                <button
                  onClick={() => onUpgrade(planId)}
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: tier.color, color: '#fff' }}
                >
                  Upgrade to {tier.name}
                </button>
              ) : isPaid ? (
                // Landing page: send to sign-up with plan pre-selected
                <Link
                  to={`/sign-up?plan=${planId}`}
                  className="block w-full py-2 rounded-lg text-center text-sm font-semibold transition-colors"
                  style={{ background: tier.color, color: '#fff' }}
                >
                  Start {tier.name} — ${tier.price}/mo
                </Link>
              ) : (
                <Link
                  to="/sign-up"
                  className="block w-full py-2 rounded-lg text-center text-sm font-semibold transition-colors"
                  style={{ background: tier.color, color: '#fff' }}
                >
                  Get started
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section id="faq" className="px-6 md:px-10 py-24 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
      <div className="space-y-2">
        {FAQS.map(({ q, a }, i) => (
          <div key={i} className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left font-medium text-sm"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {q}
              <ChevronDown
                size={16}
                className="shrink-0 text-gray-500 transition-transform"
                style={{ transform: open === i ? 'rotate(180deg)' : 'none' }}
              />
            </button>
            {open === i && (
              <div className="px-5 pb-4 text-sm text-gray-400 leading-relaxed border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="pt-4">{a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section
      className="border-t py-20 text-center px-6"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <h2 className="text-3xl font-bold mb-4">Ready to run the whole deal in one place?</h2>
      <p className="text-gray-400 mb-8 max-w-xl mx-auto">
        Stop stitching together lead lists, Excel, Word, and your inbox. Find your next deal on a
        scored map and take it all the way to a signed close — from a single terminal-style dashboard.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/sign-up"
          className="flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-base bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          Start for free <ArrowRight size={16} />
        </Link>
        <a
          href="#pricing"
          className="px-8 py-3.5 rounded-lg font-medium text-base border hover:border-gray-500 transition-colors"
          style={{ borderColor: 'var(--border)' }}
        >
          View pricing
        </a>
      </div>
      <p className="text-xs text-gray-600 mt-5">
        No credit card required · Upgrade or cancel anytime from your billing portal
      </p>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="border-t px-8 py-8"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-blue-400" />
          <span className="font-semibold text-sm">SmartInvestorCRM</span>
        </div>
        <div className="flex gap-6 text-xs text-gray-500">
          <Link to="/sign-in" className="hover:text-gray-300 transition-colors">Sign in</Link>
          <a href="#features" className="hover:text-gray-300 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-gray-300 transition-colors">FAQ</a>
        </div>
        <p className="text-xs text-gray-600 text-center">
          © {new Date().getFullYear()} SmartInvestorCRM · General education only, not legal or financial advice.
          Payments via Stripe · Auth via Firebase.
        </p>
      </div>
    </footer>
  )
}
