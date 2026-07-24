import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Globe2, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { db } from '../../lib/firebase'
import type { MarketSignal } from '../../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

// Direct Firestore CRUD — firestore.rules already restricts market_signals
// writes to the `admin` custom claim (allow write: if isAdmin()), so this
// page can write straight through the client SDK with the signed-in admin's
// own credentials. No backend route needed. Reads are open to any signed-in
// user per the same rules block; this page is just the only place that
// *edits* it, gated by AdminRoute.
function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function AdminMarketSignals() {
  const [signals, setSignals] = useState<MarketSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'market_signals'), orderBy('label')),
      (snap) => {
        setSignals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MarketSignal))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const slug = slugify(newSlug || newLabel)
    if (!newLabel.trim() || !slug) return
    if (signals.some((s) => s.id === slug)) {
      setError(`A market signal with id "${slug}" already exists.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setDoc(doc(db, 'market_signals', slug), {
        label: newLabel.trim(),
        updatedAt: serverTimestamp(),
      })
      setNewLabel('')
      setNewSlug('')
      setSlugEdited(false)
      setShowForm(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Shared market reference data — readable by every signed-in user, editable only here.
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New market signal
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border p-4 mb-6 space-y-3" style={bd}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Label (e.g. "Denver-Aurora-Lakewood, CO")</label>
              <input
                autoFocus
                required
                className={INPUT}
                style={bd}
                value={newLabel}
                onChange={(e) => {
                  setNewLabel(e.target.value)
                  if (!slugEdited) setNewSlug(slugify(e.target.value))
                }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Doc id (slug — immutable after creation)</label>
              <input
                required
                className={INPUT}
                style={bd}
                value={newSlug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setNewSlug(slugify(e.target.value))
                }}
              />
            </div>
          </div>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Create
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : signals.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-gray-400" style={bd}>
          <p className="flex items-center gap-2 font-medium text-gray-300">
            <Globe2 size={16} /> No market signals yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  )
}

function SignalCard({ signal }: { signal: MarketSignal }) {
  async function patch(fields: Partial<MarketSignal>) {
    await updateDoc(doc(db, 'market_signals', signal.id), { ...fields, updatedAt: serverTimestamp() })
  }

  async function handleDelete() {
    if (!confirm(`Delete market signal "${signal.label}"?`)) return
    await deleteDoc(doc(db, 'market_signals', signal.id))
  }

  return (
    <div className="rounded-xl border p-4" style={bd}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">{signal.label}</p>
          <p className="text-xs text-gray-500 font-mono">{signal.id}</p>
        </div>
        <button onClick={handleDelete} className="text-gray-500 hover:text-rose-400 transition-colors">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Label</label>
          <input className={INPUT} style={bd} defaultValue={signal.label} onBlur={(e) => patch({ label: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Investability score (0-100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className={INPUT}
            style={bd}
            defaultValue={signal.investabilityScore ?? ''}
            onBlur={(e) => patch({ investabilityScore: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs text-gray-500 block mb-1">Headline (short investor-facing insight)</label>
        <input className={INPUT} style={bd} defaultValue={signal.headline ?? ''} onBlur={(e) => patch({ headline: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Notes</label>
        <textarea rows={2} className={INPUT} style={bd} defaultValue={signal.notes ?? ''} onBlur={(e) => patch({ notes: e.target.value })} />
      </div>
    </div>
  )
}
