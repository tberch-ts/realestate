import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { CAPITAL_RAISE_STATUS_LABELS, type CapitalRaise } from '../lib/collections'

export default function CapitalRaisePage() {
  const { user } = useAuth()
  const [raises, setRaises] = useState<CapitalRaise[]>([])
  const [showForm, setShowForm] = useState(false)
  const [dealName, setDealName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'capital_raises'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc')),
      (snap) => setRaises(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CapitalRaise))
    )
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !dealName.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'capital_raises'), {
        ownerId: user.uid,
        members: [],
        dealName: dealName.trim(),
        status: 'planning',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setDealName('')
      setShowForm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Capital Raise</h1>
          <p className="text-sm text-gray-500">Track LP equity raises for your deals, from planning to fully funded.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New raise
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            autoFocus
            required
            placeholder="Deal / raise name"
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {raises.length === 0 ? (
        <p className="text-sm text-gray-500">No capital raises yet — add your first one above.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {raises.map((r) => (
            <Link
              key={r.id}
              to={`/app/capital/${r.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2">
                  <span className="truncate">{r.dealName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-gray-400 shrink-0" style={{ border: '1px solid var(--border)' }}>
                    {CAPITAL_RAISE_STATUS_LABELS[r.status]}
                  </span>
                </div>
                {r.address && <p className="text-xs text-gray-500 truncate mt-0.5">{r.address}</p>}
              </div>
              <RaiseProgress raised={r.raisedAmount} target={r.targetAmount} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function RaiseProgress({ raised, target }: { raised?: number; target?: number }) {
  if (!target) {
    return <span className="text-xs text-gray-500 shrink-0">{raised ? fmtMoney(raised) : '—'}</span>
  }
  const pct = Math.min(100, Math.round(((raised ?? 0) / target) * 100))
  return (
    <div className="flex items-center gap-2 shrink-0 w-40">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
    </div>
  )
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
