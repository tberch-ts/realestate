import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { PostgridSender, UserProfile } from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

export default function Settings() {
  const { user } = useAuth()
  const [sender, setSender] = useState<PostgridSender>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data() as UserProfile | undefined
      if (data?.postgridSender) setSender(data.postgridSender)
    })
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    await setDoc(doc(db, 'users', user.uid), { postgridSender: sender }, { merge: true })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Profile</h2>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between">
            <dt className="text-gray-500">Name</dt>
            <dd>{user?.displayName ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border p-5 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Mailing address</h2>
        <p className="text-xs text-gray-500 mb-4">
          Used as the return address on LOIs and postal letters sent via PostGrid.
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          <input
            placeholder="Company / your name"
            value={sender.companyName ?? ''}
            onChange={(e) => setSender((s) => ({ ...s, companyName: e.target.value }))}
            className={INPUT} style={bd}
          />
          <input
            placeholder="Address line 1"
            value={sender.addressLine1 ?? ''}
            onChange={(e) => setSender((s) => ({ ...s, addressLine1: e.target.value }))}
            className={INPUT} style={bd}
          />
          <input
            placeholder="Address line 2 (optional)"
            value={sender.addressLine2 ?? ''}
            onChange={(e) => setSender((s) => ({ ...s, addressLine2: e.target.value }))}
            className={INPUT} style={bd}
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              placeholder="City"
              value={sender.city ?? ''}
              onChange={(e) => setSender((s) => ({ ...s, city: e.target.value }))}
              className={INPUT} style={bd}
            />
            <input
              placeholder="State"
              value={sender.stateCode ?? ''}
              onChange={(e) => setSender((s) => ({ ...s, stateCode: e.target.value }))}
              className={INPUT} style={bd}
            />
            <input
              placeholder="ZIP"
              value={sender.zip ?? ''}
              onChange={(e) => setSender((s) => ({ ...s, zip: e.target.value }))}
              className={INPUT} style={bd}
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors">
            {saved ? 'Saved ✓' : 'Save address'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Billing</h2>
        <p className="text-sm text-gray-500 mb-3">Manage your plan and payment method.</p>
        <Link to="/app/settings/billing" className="text-sm text-blue-400 hover:underline">
          Go to billing →
        </Link>
      </section>
    </div>
  )
}
