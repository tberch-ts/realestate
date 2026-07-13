import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { DEAL_STATUS_LABELS, type Deal } from '../lib/collections'

export default function Deals() {
  const { user } = useAuth()
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !address.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'deals'), {
        ownerId: user.uid,
        members: [],
        address: address.trim(),
        status: 'sourcing',
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
          <p className="text-sm text-gray-500">Every deal you're tracking, in one list.</p>
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
            placeholder="Property address"
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

      {deals.length === 0 ? (
        <p className="text-sm text-gray-500">No deals yet — add your first one above.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {deals.map((deal) => (
            <Link
              key={deal.id}
              to={`/app/deals/${deal.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>{deal.address}</span>
              <span className="text-xs px-2 py-0.5 rounded-full text-gray-400" style={{ border: '1px solid var(--border)' }}>
                {DEAL_STATUS_LABELS[deal.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
