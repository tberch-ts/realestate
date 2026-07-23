import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { FileSignature, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import {
  DEAL_STATUSES,
  DEAL_STATUS_LABELS,
  LAND_DEAL_STATUSES,
  LAND_DEAL_STATUS_LABELS,
  type Deal,
} from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'

const NUMERIC_FIELDS: ReadonlyArray<keyof Deal> = [
  'units', 'price', 'capRate', 'lotAcres', 'contractPrice', 'builderPrice', 'assignmentFee',
]

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
    if (NUMERIC_FIELDS.includes(field)) {
      patch[field] = value === '' ? undefined : Number(value)
    } else {
      patch[field] = value
    }
    // Keep the spread in sync when either side of it changes.
    if (deal && (field === 'contractPrice' || field === 'builderPrice')) {
      const contract = field === 'contractPrice' ? (value === '' ? undefined : Number(value)) : deal.contractPrice
      const builder = field === 'builderPrice' ? (value === '' ? undefined : Number(value)) : deal.builderPrice
      patch.assignmentFee = contract != null && builder != null ? builder - contract : undefined
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

  const isLand = deal.strategy === 'land'
  const statuses = isLand ? LAND_DEAL_STATUSES : DEAL_STATUSES
  const statusLabels: Record<string, string> = isLand ? LAND_DEAL_STATUS_LABELS : DEAL_STATUS_LABELS
  const spread =
    deal.contractPrice != null && deal.builderPrice != null ? deal.builderPrice - deal.contractPrice : undefined

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{deal.address}</h1>
          {isLand && <p className="text-xs text-gray-500 mt-1">Empty Lots — contract assignment deal</p>}
        </div>
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
            {statuses.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </div>

        {isLand ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Parcel ID</label>
                <input className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.parcelId ?? ''} onBlur={(e) => handleChange('parcelId', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Lot acres</label>
                <input type="number" step="0.01" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.lotAcres ?? ''} onBlur={(e) => handleChange('lotAcres', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Contract price (to seller)</label>
                <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.contractPrice ?? ''} onBlur={(e) => handleChange('contractPrice', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Builder price (buy box)</label>
                <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.builderPrice ?? ''} onBlur={(e) => handleChange('builderPrice', e.target.value)} />
              </div>
            </div>

            <div
              className="rounded-lg border px-4 py-3 text-sm flex items-center justify-between"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-gray-400">Assignment spread (your profit — no capital in the deal)</span>
              <span className={`font-semibold ${spread != null && spread > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                {spread != null ? `$${spread.toLocaleString()}` : '—'}
              </span>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                to={`/app/land/contract?address=${encodeURIComponent(deal.address)}&parcelId=${encodeURIComponent(deal.parcelId ?? '')}&price=${deal.contractPrice ?? ''}`}
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <FileSignature size={14} /> Seller contract (P&S)
              </Link>
              <Link
                to={`/app/land/contract?tab=assignment&address=${encodeURIComponent(deal.address)}&parcelId=${encodeURIComponent(deal.parcelId ?? '')}&price=${deal.contractPrice ?? ''}&fee=${deal.assignmentFee ?? ''}`}
                className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <FileSignature size={14} /> Builder assignment
              </Link>
            </div>
          </>
        ) : (
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
        )}

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea rows={4} className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={deal.notes ?? ''} onBlur={(e) => handleChange('notes', e.target.value)} />
        </div>
      </div>
    </div>
  )
}
