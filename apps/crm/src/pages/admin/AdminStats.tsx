import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Kanban, Contact2, FileText, DollarSign, Package, AlertTriangle } from 'lucide-react'
import { fetchAdminStats, type AdminStats as AdminStatsData } from '../../lib/api'
import { PLAN_TIERS } from '../../types/plan'

const card = { background: 'var(--bg-card)', borderColor: 'var(--border)' }

function StatTile({ icon: Icon, color, value, label, to }: { icon: typeof Users; color: string; value: number; label: string; to?: string }) {
  const body = (
    <>
      <Icon size={18} style={{ color }} className="mb-3" />
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </>
  )
  const className = 'rounded-xl border p-5 hover:border-gray-500 transition-colors block'
  return to ? (
    <Link to={to} className={className} style={card}>{body}</Link>
  ) : (
    <div className={className} style={card}>{body}</div>
  )
}

export default function AdminStats() {
  const [stats, setStats] = useState<AdminStatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminStats().then(setStats).catch((err) => setError((err as Error).message))
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm px-4 py-3 max-w-xl flex items-center gap-2">
        <AlertTriangle size={14} /> {error}
      </div>
    )
  }

  if (!stats) {
    return <p className="text-sm text-gray-500">Loading…</p>
  }

  const maxSignups = Math.max(1, ...stats.signupsByMonth.map((m) => m.count))
  const planLabel = (plan: string) => PLAN_TIERS[plan]?.name ?? plan
  const planColor = (plan: string) => PLAN_TIERS[plan]?.color ?? '#64748b'
  const maxPlanCount = Math.max(1, ...stats.planBreakdown.map((p) => p.count))

  return (
    <div>
      {stats.usersTruncated && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs px-4 py-2 mb-6 flex items-center gap-2">
          <AlertTriangle size={13} /> User count hit the 10,000-user pagination cap — numbers below are a lower bound.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        <StatTile icon={Users} color="#38bdf8" value={stats.userCount} label="Total users" to="/app/admin/users" />
        <StatTile icon={DollarSign} color="#34d399" value={stats.mrrEstimate} label="Est. MRR ($)" />
        <StatTile icon={Kanban} color="#60a5fa" value={stats.collections.deals} label="Deals (all users)" />
        <StatTile icon={Contact2} color="#34d399" value={stats.collections.contacts} label="Contacts (all users)" />
        <StatTile icon={FileText} color="#fbbf24" value={stats.collections.lois} label="LOIs (all users)" />
        <StatTile icon={DollarSign} color="#a78bfa" value={stats.collections.capitalRaises} label="Capital raises" />
        <StatTile icon={Package} color="#f472b6" value={stats.collections.builderBuyBoxes} label="Builder buy boxes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border p-5" style={card}>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Plan breakdown</h2>
          {stats.planBreakdown.length === 0 ? (
            <p className="text-sm text-gray-500">No users yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.planBreakdown.map((row) => (
                <div key={row.plan}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{planLabel(row.plan)}</span>
                    <span className="text-gray-500">{row.count}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(row.count / maxPlanCount) * 100}%`, background: planColor(row.plan) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border p-5" style={card}>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Signups by month</h2>
          {stats.signupsByMonth.length === 0 ? (
            <p className="text-sm text-gray-500">No signups yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.signupsByMonth.slice(-12).map((row) => (
                <div key={row.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">{row.month}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(row.count / maxSignups) * 100}%`, background: '#38bdf8' }} />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right shrink-0">{row.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
