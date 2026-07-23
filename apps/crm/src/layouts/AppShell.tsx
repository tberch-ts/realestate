import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2, LayoutDashboard, Kanban, Search, Users, FileText,
  MapPin, Layers, FileSearch, BookOpen,
  TrendingUp, DollarSign, GraduationCap, Settings as SettingsIcon, LogOut,
  LandPlot, Package, Flame, FileSignature,
} from 'lucide-react'
import type { StrategyKey } from '@mfa/shared'
import { useAuth } from '../context/AuthContext'
import { StrategyProvider, useStrategy, STRATEGY_LABELS } from '../lib/strategy'

// `strategy` gates an item to one strategy's nav; undefined = shown in both.
const NAV: Array<{
  to: string
  end?: boolean
  icon: typeof LayoutDashboard
  label: string
  strategy?: StrategyKey
}> = [
  { to: '/app', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/deals', icon: Kanban, label: 'Deal Board' },
  { to: '/app/property-search', icon: Search, label: 'Property Search', strategy: 'multifamily' },
  { to: '/app/contacts', icon: Users, label: 'Contacts' },
  { to: '/app/loi', icon: FileText, label: 'LOIs', strategy: 'multifamily' },
  { to: '/app/hotspots', icon: MapPin, label: 'Hotspots', strategy: 'multifamily' },
  { to: '/app/portfolio', icon: Layers, label: 'Portfolio', strategy: 'multifamily' },
  { to: '/app/filings', icon: FileSearch, label: 'Filings', strategy: 'multifamily' },
  { to: '/app/playbook', icon: BookOpen, label: 'Playbook', strategy: 'multifamily' },
  { to: '/app/land/leads', icon: LandPlot, label: 'Land Leads', strategy: 'land' },
  { to: '/app/land/buy-boxes', icon: Package, label: 'Builder Buy Boxes', strategy: 'land' },
  { to: '/app/land/saturation', icon: Flame, label: 'Saturation Map', strategy: 'land' },
  { to: '/app/land/contract', icon: FileSignature, label: 'Contract', strategy: 'land' },
  { to: '/app/land/playbook', icon: BookOpen, label: 'Land Playbook', strategy: 'land' },
  { to: '/app/market', icon: TrendingUp, label: 'Market Intel' },
  { to: '/app/capital', icon: DollarSign, label: 'Capital Raise', strategy: 'multifamily' },
  { to: '/app/learn', icon: GraduationCap, label: 'Learn', strategy: 'multifamily' },
  { to: '/app/settings', icon: SettingsIcon, label: 'Settings' },
]

const STRATEGIES: StrategyKey[] = ['multifamily', 'land']

function StrategyToggle() {
  const { strategy, setStrategy } = useStrategy()
  return (
    <div
      className="flex rounded-lg p-0.5 mb-5 text-xs"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
      role="tablist"
      aria-label="Strategy"
    >
      {STRATEGIES.map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={strategy === s}
          onClick={() => setStrategy(s)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${
            strategy === s ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {s === 'multifamily' ? <Building2 size={13} /> : <LandPlot size={13} />}
          {STRATEGY_LABELS[s]}
        </button>
      ))}
    </div>
  )
}

function Shell() {
  const { user, signOut } = useAuth()
  const { strategy } = useStrategy()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const items = NAV.filter((i) => !i.strategy || i.strategy === strategy)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)', color: '#f9fafb' }}>
      <aside
        className="w-56 shrink-0 border-r flex flex-col px-3 py-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-2 px-2 mb-4">
          <Building2 size={18} className="text-blue-400" />
          <span className="font-bold tracking-tight text-sm">SmartInvestorCRM</span>
        </div>

        <StrategyToggle />

        <nav className="flex-1 space-y-0.5">
          {items.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-600/15 text-blue-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="px-2 mb-2">
            <p className="text-xs font-medium truncate">{user?.displayName ?? user?.email}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}

export default function AppShell() {
  return (
    <StrategyProvider>
      <Shell />
    </StrategyProvider>
  )
}
