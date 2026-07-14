import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/firebase'
import {
  CAPITAL_RAISE_STATUSES,
  CAPITAL_RAISE_STATUS_LABELS,
  LP_STAGES,
  LP_STAGE_LABELS,
  type CapitalRaise,
  type LpCommitment,
  type LpStage,
} from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'

export default function CapitalRaiseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [raise, setRaise] = useState<CapitalRaise | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [lps, setLps] = useState<LpCommitment[]>([])
  const [showLpForm, setShowLpForm] = useState(false)
  const [lpName, setLpName] = useState('')
  const [lpAmount, setLpAmount] = useState('')
  const [lpStage, setLpStage] = useState<LpStage>('verbal')
  const [busy, setBusy] = useState(false)

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

  useEffect(() => {
    if (!id) return
    return onSnapshot(
      query(collection(db, 'capital_raises', id, 'lp_commitments'), orderBy('createdAt', 'desc')),
      (snap) => setLps(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LpCommitment))
    )
  }, [id])

  async function handleAddLp(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !user || !lpName.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'capital_raises', id, 'lp_commitments'), {
        ownerId: user.uid,
        raiseId: id,
        investorName: lpName.trim(),
        committedAmount: lpAmount === '' ? undefined : Number(lpAmount),
        stage: lpStage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setLpName('')
      setLpAmount('')
      setLpStage('verbal')
      setShowLpForm(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleLpStageChange(lpId: string, stage: LpStage) {
    if (!id) return
    await updateDoc(doc(db, 'capital_raises', id, 'lp_commitments', lpId), {
      stage,
      updatedAt: serverTimestamp(),
    })
  }

  async function handleLpDelete(lpId: string) {
    if (!id) return
    await deleteDoc(doc(db, 'capital_raises', id, 'lp_commitments', lpId))
  }

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

      <LpFunnel
        lps={lps}
        showForm={showLpForm}
        toggleForm={() => setShowLpForm((s) => !s)}
        onAdd={handleAddLp}
        onStageChange={handleLpStageChange}
        onDelete={handleLpDelete}
        busy={busy}
        name={lpName}
        setName={setLpName}
        amount={lpAmount}
        setAmount={setLpAmount}
        stage={lpStage}
        setStage={setLpStage}
      />
    </div>
  )
}

function LpFunnel(props: {
  lps: LpCommitment[]
  showForm: boolean
  toggleForm: () => void
  onAdd: (e: React.FormEvent) => void
  onStageChange: (lpId: string, stage: LpStage) => void
  onDelete: (lpId: string) => void
  busy: boolean
  name: string
  setName: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  stage: LpStage
  setStage: (v: LpStage) => void
}) {
  const { lps } = props
  const totals = LP_STAGES.reduce(
    (acc, s) => {
      const inStage = lps.filter((l) => l.stage === s)
      acc[s] = { count: inStage.length, amount: inStage.reduce((sum, l) => sum + (l.committedAmount ?? 0), 0) }
      return acc
    },
    {} as Record<LpStage, { count: number; amount: number }>
  )
  const fundedTotal = totals.funded.amount

  return (
    <div className="mt-8 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">LP commitments</h2>
        <button
          onClick={props.toggleForm}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> Add LP
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {LP_STAGES.map((s) => (
          <div key={s} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[11px] text-gray-500">{LP_STAGE_LABELS[s]}</p>
            <p className="text-sm font-semibold text-gray-100">{fmtMoney(totals[s].amount)}</p>
            <p className="text-[11px] text-gray-500">{totals[s].count} LP{totals[s].count === 1 ? '' : 's'}</p>
          </div>
        ))}
      </div>
      {fundedTotal > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          Funded LPs total {fmtMoney(fundedTotal)} — update "Raised so far" above if it should match.
        </p>
      )}

      {props.showForm && (
        <form onSubmit={props.onAdd} className="flex flex-wrap gap-2 mb-4">
          <input
            autoFocus
            required
            placeholder="Investor name"
            value={props.name}
            onChange={(e) => props.setName(e.target.value)}
            className="flex-1 min-w-[140px] rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
          <input
            type="number"
            placeholder="Committed $"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
            className="w-32 rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
          <select
            value={props.stage}
            onChange={(e) => props.setStage(e.target.value as LpStage)}
            className="rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          >
            {LP_STAGES.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {LP_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" disabled={props.busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {lps.length === 0 ? (
        <p className="text-sm text-gray-500">No LP commitments yet — add your first one above.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {lps.map((lp) => (
            <div
              key={lp.id}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex-1 min-w-0 mr-4">
                <span className="truncate">{lp.investorName}</span>
                {lp.committedAmount !== undefined && (
                  <span className="text-xs text-gray-500 ml-2">{fmtMoney(lp.committedAmount)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={lp.stage}
                  onChange={(e) => props.onStageChange(lp.id, e.target.value as LpStage)}
                  className="rounded-lg border px-2 py-1 text-xs bg-transparent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {LP_STAGES.map((s) => (
                    <option key={s} value={s} className="bg-slate-900">
                      {LP_STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button onClick={() => props.onDelete(lp.id)} className="text-gray-500 hover:text-rose-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
