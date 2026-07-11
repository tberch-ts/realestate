import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { DEAL_STATUSES, DEAL_STATUS_LABELS, type Deal } from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'

export default function DealDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(db, 'deals', id),
      (snap) => {
        if (!snap.exists()) return setNotFound(true)
        setDeal({ id: snap.id, ...snap.data() } as Deal)
      },
      () => setNotFound(true)
    )
  }, [id])

  async function handleChange(field: keyof Deal, value: string) {
    if (!id) return
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (field === 'units' || field === 'price' || field === 'capRate') {
      patch[field] = value === '' ? undefined : Number(value)
    } else {
      patch[field] = value
    }
    await updateDoc(doc(db, 'deals', id), patch)
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this deal?')) return
    await deleteDoc(doc(db, 'deals', id))
    navigate('/app/deals')
  }

  if (notFound) return <p className="text-sm text-gray-500">Deal not found.</p>
  if (!deal) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{deal.address}</h1>
        <button onClick={handleDelete} className="text-gray-500 hover:text-rose-400 transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Address</label>
          <input className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.address} onBlur={(e) => handleChange('address', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select
            className={INPUT}
            style={{ borderColor: 'var(--border)' }}
            value={deal.status}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            {DEAL_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {DEAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Units</label>
            <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.units ?? ''} onBlur={(e) => handleChange('units', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Price</label>
            <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.price ?? ''} onBlur={(e) => handleChange('price', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Cap rate %</label>
            <input type="number" step="0.01" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.capRate ?? ''} onBlur={(e) => handleChange('capRate', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea rows={4} className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.notes ?? ''} onBlur={(e) => handleChange('notes', e.target.value)} />
        </div>
      </div>
    </div>
  )
}
