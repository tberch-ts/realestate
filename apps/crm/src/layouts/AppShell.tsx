import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2, LayoutDashboard, Kanban, Search, Users, FileText,
  MapPin, TrendingUp, DollarSign, GraduationCap, Settings as SettingsIcon, LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/app', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/deals', icon: Kanban, label: 'Deal Board' },
  { to: '/app/property-search', icon: Search, label: 'Property Search' },
  { to: '/app/contacts', icon: Users, label: 'Contacts' },
  { to: '/app/loi', icon: FileText, label: 'LOIs' },
  { to: '/app/hotspots', icon: MapPin, label: 'Hotspots' },
  { to: '/app/market', icon: TrendingUp, label: 'Market Intel' },
  { to: '/app/capital', icon: DollarSign, label: 'Capital Raise' },
  { to: '/app/learn', icon: GraduationCap, label: 'Learn' },
  { to: '/app/settings', icon: SettingsIcon, label: 'Settings' },
]

export default function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)', color: '#f9fafb' }}>
      <aside
        className="w-56 shrink-0 border-r flex flex-col px-3 py-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-2 px-2 mb-6">
          <Building2 size={18} className="text-blue-400" />
          <span className="font-bold tracking-tight text-sm">SmartInvestorCRM</span>
        </div>

        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ to, end, icon: Icon, label }) => (
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
