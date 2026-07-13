import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { CAPITAL_RAISE_STATUSES, CAPITAL_RAISE_STATUS_LABELS, type CapitalRaise } from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'

export default function CapitalRaiseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [raise, setRaise] = useState<CapitalRaise | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(db, 'capital_raises', id),
      (snap) => {
        if (!snap.exists()) return setNotFound(true)
        setRaise({ id: snap.id, ...snap.data() } as CapitalRaise)
      },
      () => setNotFound(true)
    )
  }, [id])

  async function handleChange(field: keyof CapitalRaise, value: string) {
    if (!id) return
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (field === 'targetAmount' || field === 'raisedAmount' || field === 'minInvestment') {
      patch[field] = value === '' ? undefined : Number(value)
    } else {
      patch[field] = value
    }
    await updateDoc(doc(db, 'capital_raises', id), patch)
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this capital raise?')) return
    await deleteDoc(doc(db, 'capital_raises', id))
    navigate('/app/capital')
  }

  if (notFound) return <p className="text-sm text-gray-500">Capital raise not found.</p>
  if (!raise) return <p className="text-sm text-gray-500">Loading…</p>

  const target = raise.targetAmount ?? 0
  const raised = raise.raisedAmount ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{raise.dealName}</h1>
        <button onClick={handleDelete} className="text-gray-500 hover:text-rose-400 transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      {target > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{fmtMoney(raised)} raised</span>
            <span>{pct}% of {fmtMoney(target)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Deal / raise name</label>
          <input className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.dealName} onBlur={(e) => handleChange('dealName', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Property address</label>
          <input className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.address ?? ''} onBlur={(e) => handleChange('address', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select
            className={INPUT}
            style={{ borderColor: 'var(--border)' }}
            value={raise.status}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            {CAPITAL_RAISE_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {CAPITAL_RAISE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Target amount</label>
            <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.targetAmount ?? ''} onBlur={(e) => handleChange('targetAmount', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Raised so far</label>
            <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.raisedAmount ?? ''} onBlur={(e) => handleChange('raisedAmount', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Min investment</label>
            <input type="number" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.minInvestment ?? ''} onBlur={(e) => handleChange('minInvestment', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Target close date</label>
          <input type="date" className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.targetCloseDate ?? ''} onBlur={(e) => handleChange('targetCloseDate', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea rows={4} className={INPUT} style={{ borderColor: 'var(--border)' }} defaultValue={raise.notes ?? ''} onBlur={(e) => handleChange('notes', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
