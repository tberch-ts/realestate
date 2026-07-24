import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Sits inside ProtectedRoute's territory (nested under /app) but adds the
// `admin` custom-claim check on top. Non-admins bounce to /app rather than
// /sign-in since they're already signed in — this is a "you don't have
// access" redirect, not an auth gate.
export default function AdminRoute() {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm text-gray-500 mono">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  if (!isAdmin) {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}
