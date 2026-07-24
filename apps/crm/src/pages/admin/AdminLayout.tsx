import { NavLink, Outlet } from 'react-router-dom'

const TABS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/app/admin', label: 'Overview', end: true },
  { to: '/app/admin/users', label: 'Users' },
  { to: '/app/admin/market-signals', label: 'Market Signals' },
]

// Wraps the three admin pages in a small tab bar, itself nested inside
// AdminRoute (claim check) + AppShell (main sidebar/nav) — see main.tsx.
export default function AdminLayout() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-gray-500">Internal tools — visible only to admin accounts.</p>
      </div>

      <nav className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                isActive ? 'border-blue-500 text-blue-300' : 'border-transparent text-gray-400 hover:text-white'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
