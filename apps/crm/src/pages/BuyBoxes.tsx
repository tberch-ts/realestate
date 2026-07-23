import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { Package, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { BuilderBuyBox, BuyBoxZipRow } from '../lib/collections'

// Builder buy boxes: the doc a builder hands you — closing terms, desired
// zip codes (with the price they pay per qualifying lot), requirements,
// restrictions. Land leads are matched against every ACTIVE box
// (lib/landMatch.ts); "when you get the builder exactly what they want,
// they buy all day long."

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

export default function BuyBoxes() {
  const { user } = useAuth()
  const [boxes, setBoxes] = useState<BuilderBuyBox[]>([])
  const [showForm, setShowForm] = useState(false)
  const [builderName, setBuilderName] = useState('')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'builder_buy_boxes'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc')),
      (snap) => setBoxes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BuilderBuyBox))
    )
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !builderName.trim()) return
    setBusy(true)
    try {
      const ref = await addDoc(collection(db, 'builder_buy_boxes'), {
        ownerId: user.uid,
        members: [],
        builderName: builderName.trim(),
        active: true,
        closingTerms: [],
        zipRows: [],
        requirements: [],
        restrictions: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setBuilderName('')
      setShowForm(false)
      setOpenId(ref.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Builder Buy Boxes</h1>
          <p className="text-sm text-gray-500">
            What each builder buys, where, and at what price — get this from every builder you talk to.
            Active boxes auto-match against your Land Leads.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New buy box
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            autoFocus
            required
            placeholder="Builder name (e.g. Coastal Homes LLC)"
            value={builderName}
            onChange={(e) => setBuilderName(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={bd}
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {boxes.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-gray-400" style={bd}>
          <p className="flex items-center gap-2 font-medium text-gray-300 mb-2">
            <Package size={16} /> No buy boxes yet.
          </p>
          <p>
            When a builder tells you what they buy, capture it here. The key information to get:
            <span className="text-gray-300"> closing terms</span>,
            <span className="text-gray-300"> desired zip codes</span> (and the price they pay per lot in each),
            <span className="text-gray-300"> requirements</span>, and
            <span className="text-gray-300"> restrictions</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {boxes.map((box) => (
            <BoxCard key={box.id} box={box} open={openId === box.id} onToggle={() => setOpenId(openId === box.id ? null : box.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BoxCard({ box, open, onToggle }: { box: BuilderBuyBox; open: boolean; onToggle: () => void }) {
  async function patch(fields: Partial<BuilderBuyBox>) {
    await updateDoc(doc(db, 'builder_buy_boxes', box.id), { ...fields, updatedAt: serverTimestamp() })
  }

  async function handleDelete() {
    if (!confirm(`Delete buy box for ${box.builderName}?`)) return
    await deleteDoc(doc(db, 'builder_buy_boxes', box.id))
  }

  return (
    <div className="rounded-xl border" style={bd}>
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <Package size={16} className={box.active ? 'text-emerald-400' : 'text-gray-600'} />
          <div>
            <p className="text-sm font-semibold">{box.builderName}</p>
            <p className="text-xs text-gray-500">
              {box.areaLabel || 'No area set'} · {box.zipRows?.length ?? 0} zip{(box.zipRows?.length ?? 0) === 1 ? '' : 's'}
              {box.targetSpread != null && ` · target spread $${box.targetSpread.toLocaleString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={box.active} onChange={(e) => patch({ active: e.target.checked })} />
            Active
          </label>
          <button onClick={handleDelete} className="text-gray-500 hover:text-rose-400 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t px-4 py-4 space-y-5" style={bd}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Builder name</label>
              <input className={INPUT} style={bd} defaultValue={box.builderName} onBlur={(e) => patch({ builderName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Area (e.g. "Tampa, FL")</label>
              <input className={INPUT} style={bd} defaultValue={box.areaLabel ?? ''} onBlur={(e) => patch({ areaLabel: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Target assignment spread ($ — suggested offer = builder price − spread)</label>
            <input
              type="number"
              className={INPUT}
              style={bd}
              defaultValue={box.targetSpread ?? ''}
              placeholder="10000"
              onBlur={(e) => patch({ targetSpread: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<BuilderBuyBox>)}
            />
          </div>

          <ZipRowsEditor rows={box.zipRows ?? []} onChange={(zipRows) => patch({ zipRows })} />

          <ListEditor
            label="Closing terms"
            placeholder="e.g. Cash, 15-day close, buyer pays all closing costs"
            items={box.closingTerms ?? []}
            onChange={(closingTerms) => patch({ closingTerms })}
          />
          <ListEditor
            label="Requirements"
            placeholder="e.g. Minimum 50 ft lot width, utilities at street"
            items={box.requirements ?? []}
            onChange={(requirements) => patch({ requirements })}
          />
          <ListEditor
            label="Restrictions"
            placeholder="e.g. No wetlands, no HOA, not in flood zone A"
            items={box.restrictions ?? []}
            onChange={(restrictions) => patch({ restrictions })}
          />

          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <textarea rows={2} className={INPUT} style={bd} defaultValue={box.notes ?? ''} onBlur={(e) => patch({ notes: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}

function ZipRowsEditor({ rows, onChange }: { rows: BuyBoxZipRow[]; onChange: (rows: BuyBoxZipRow[]) => void }) {
  function update(i: number, patch: Partial<BuyBoxZipRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange(next)
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...rows, { zip: '', price: 0 }])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500">Buy box by zip code (price = what the builder pays for a qualifying lot)</label>
        <button type="button" onClick={add} className="text-xs text-blue-400 hover:text-blue-300">
          + Add zip
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-600">No zips yet — leads can only match once a zip row exists.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={bd}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b" style={bd}>
                <th className="py-1.5 px-2 font-medium">Zip</th>
                <th className="py-1.5 px-2 font-medium">Min ac</th>
                <th className="py-1.5 px-2 font-medium">Max ac</th>
                <th className="py-1.5 px-2 font-medium">Min width ft</th>
                <th className="py-1.5 px-2 font-medium">Utilities</th>
                <th className="py-1.5 px-2 font-medium">Builder price $</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t" style={bd}>
                  <Cell><input className={CELL_INPUT} style={bd} defaultValue={r.zip} placeholder="33556" onBlur={(e) => update(i, { zip: e.target.value.trim() })} /></Cell>
                  <Cell><input type="number" step="0.01" className={CELL_INPUT} style={bd} defaultValue={r.minAcres ?? ''} onBlur={(e) => update(i, { minAcres: e.target.value === '' ? undefined : Number(e.target.value) })} /></Cell>
                  <Cell><input type="number" step="0.01" className={CELL_INPUT} style={bd} defaultValue={r.maxAcres ?? ''} onBlur={(e) => update(i, { maxAcres: e.target.value === '' ? undefined : Number(e.target.value) })} /></Cell>
                  <Cell><input type="number" className={CELL_INPUT} style={bd} defaultValue={r.minWidthFt ?? ''} onBlur={(e) => update(i, { minWidthFt: e.target.value === '' ? undefined : Number(e.target.value) })} /></Cell>
                  <Cell><input className={CELL_INPUT} style={bd} defaultValue={r.utilities ?? ''} placeholder="water/sewer at street" onBlur={(e) => update(i, { utilities: e.target.value })} /></Cell>
                  <Cell><input type="number" className={CELL_INPUT} style={bd} defaultValue={r.price || ''} placeholder="70000" onBlur={(e) => update(i, { price: Number(e.target.value) || 0 })} /></Cell>
                  <Cell>
                    <button type="button" onClick={() => remove(i)} className="text-gray-500 hover:text-rose-400">
                      <Trash2 size={13} />
                    </button>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="py-1 px-2 align-middle">{children}</td>
}

const CELL_INPUT = 'w-full rounded border px-1.5 py-1 text-xs bg-transparent'

function ListEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string
  placeholder: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    setDraft('')
  }

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      {items.length > 0 && (
        <ul className="mb-1.5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-xs text-gray-300 rounded border px-2 py-1" style={bd}>
              <span>{item}</span>
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-rose-400 ml-2">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-2 py-1.5 text-xs bg-transparent"
          style={bd}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" onClick={add} className="px-2.5 py-1.5 rounded-lg text-xs border text-gray-300 hover:bg-white/5" style={bd}>
          Add
        </button>
      </div>
    </div>
  )
}
