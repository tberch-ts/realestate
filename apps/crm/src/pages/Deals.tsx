import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useStrategy, STRATEGY_LABELS } from '../lib/strategy'
import {
  DEAL_STATUS_LABELS,
  LAND_DEAL_STATUS_LABELS,
  type Deal,
  type DealStatus,
  type LandDealStatus,
} from '../lib/collections'

// Absent strategy field = pre-land doc = multifamily (back-compat).
function dealStrategy(deal: Deal): 'multifamily' | 'land' {
  return deal.strategy ?? 'multifamily'
}

function statusLabel(deal: Deal): string {
  return dealStrategy(deal) === 'land'
    ? LAND_DEAL_STATUS_LABELS[deal.status as LandDealStatus] ?? deal.status
    : DEAL_STATUS_LABELS[deal.status as DealStatus] ?? deal.status
}

export default function Deals() {
  const { user } = useAuth()
  const { strategy, setStrategy } = useStrategy()
  const [deals, setDeals] = useState<Deal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'deals'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc')),
      (snap) => setDeals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Deal))
    )
  }, [user])

  const visible = deals.filter((d) => dealStrategy(d) === strategy)
  const otherCount = deals.length - visible.length
  const otherStrategy = strategy === 'land' ? 'multifamily' : 'land'

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !address.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'deals'), {
        ownerId: user.uid,
        members: [],
        address: address.trim(),
        strategy,
        status: strategy === 'land' ? 'lead' : 'sourcing',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setAddress('')
      setShowForm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Deal Board</h1>
          <p className="text-sm text-gray-500">
            Every {STRATEGY_LABELS[strategy].toLowerCase()} deal you're tracking, in one list.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New deal
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            autoFocus
            required
            placeholder={strategy === 'land' ? 'Lot address or parcel ID' : 'Property address'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500">
          No {STRATEGY_LABELS[strategy].toLowerCase()} deals yet — add your first one above.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {visible.map((deal) => (
            <Link
              key={deal.id}
              to={`/app/deals/${deal.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>{deal.address}</span>
              <span className="flex items-center gap-2">
                {dealStrategy(deal) === 'land' && deal.assignmentFee != null && (
                  <span className="text-xs text-emerald-400">
                    ${deal.assignmentFee.toLocaleString()} spread
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full text-gray-400" style={{ border: '1px solid var(--border)' }}>
                  {statusLabel(deal)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {otherCount > 0 && (
        <button
          onClick={() => setStrategy(otherStrategy)}
          className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {otherCount} deal{otherCount === 1 ? '' : 's'} in {STRATEGY_LABELS[otherStrategy]} — switch strategy to view
        </button>
      )}
    </div>
  )
}
