import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, AlertTriangle, Search } from 'lucide-react'
import { fetchAdminUsers, setAdminClaim, type AdminUserRow } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { PLAN_TIERS } from '../../types/plan'

const bd = { borderColor: 'var(--border)' }

const PLAN_BADGE: Record<string, string> = {
  free: 'text-gray-400 bg-gray-500/10',
  pro: 'text-blue-300 bg-blue-500/10',
  team: 'text-purple-300 bg-purple-500/10',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'text-emerald-300 bg-emerald-500/10',
  trialing: 'text-emerald-300 bg-emerald-500/10',
  past_due: 'text-amber-300 bg-amber-500/10',
  canceled: 'text-gray-400 bg-gray-500/10',
  unpaid: 'text-rose-300 bg-rose-500/10',
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busyUid, setBusyUid] = useState<string | null>(null)

  async function loadFirstPage() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAdminUsers()
      setUsers(res.users)
      setNextPageToken(res.nextPageToken)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMore() {
    if (!nextPageToken) return
    setLoadingMore(true)
    try {
      const res = await fetchAdminUsers(nextPageToken)
      setUsers((prev) => [...prev, ...res.users])
      setNextPageToken(res.nextPageToken)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  async function toggleAdmin(row: AdminUserRow) {
    const nextAdmin = !row.admin
    const isSelf = row.uid === currentUser?.uid
    if (isSelf && !nextAdmin) return // backend also rejects this; button is disabled below anyway
    if (!nextAdmin && !confirm(`Revoke admin access for ${row.email ?? row.uid}?`)) return
    if (nextAdmin && !confirm(`Grant admin access to ${row.email ?? row.uid}? They'll be able to manage users and market signals.`)) return

    setBusyUid(row.uid)
    setError(null)
    try {
      const result = await setAdminClaim(row.uid, nextAdmin)
      setUsers((prev) => prev.map((u) => (u.uid === row.uid ? { ...u, admin: result.admin } : u)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyUid(null)
    }
  }

  const filtered = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return u.email?.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm text-gray-500">{users.length} user{users.length === 1 ? '' : 's'} loaded{nextPageToken ? ' (more available)' : ''}</p>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            placeholder="Search email, name, uid…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-sm bg-transparent"
            style={bd}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="rounded-xl border overflow-hidden overflow-x-auto" style={bd}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b" style={bd}>
                <th className="py-2 px-3 font-medium">User</th>
                <th className="py-2 px-3 font-medium">Plan</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Signed up</th>
                <th className="py-2 px-3 font-medium">Last sign-in</th>
                <th className="py-2 px-3 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isSelf = row.uid === currentUser?.uid
                return (
                  <tr key={row.uid} className="border-t" style={bd}>
                    <td className="py-2 px-3">
                      <p className="font-medium">{row.displayName || row.email || row.uid}</p>
                      {row.displayName && <p className="text-xs text-gray-500">{row.email}</p>}
                      {row.disabled && <p className="text-xs text-rose-400">disabled</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PLAN_BADGE[row.plan] ?? PLAN_BADGE.free}`}>
                        {PLAN_TIERS[row.plan]?.name ?? row.plan}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {row.subscriptionStatus ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[row.subscriptionStatus] ?? 'text-gray-400 bg-gray-500/10'}`}>
                          {row.subscriptionStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-400">{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 px-3 text-xs text-gray-400">
                      {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => toggleAdmin(row)}
                        disabled={busyUid === row.uid || (isSelf && row.admin)}
                        title={isSelf && row.admin ? "You can't revoke your own admin access" : undefined}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          row.admin ? 'text-emerald-300 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30' : 'text-gray-400 hover:bg-white/5'
                        }`}
                        style={row.admin ? undefined : bd}
                      >
                        {row.admin ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                        {row.admin ? 'Admin' : 'Grant'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextPageToken && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 px-3 py-1.5 rounded-lg text-sm border text-gray-300 hover:bg-white/5 disabled:opacity-50"
          style={bd}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
