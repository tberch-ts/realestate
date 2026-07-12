import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { Plus } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { Contact } from '../lib/collections'

export default function Contacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(query(collection(db, 'contacts'), where('ownerId', '==', user.uid)), (snap) =>
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact))
    )
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'contacts'), {
        ownerId: user.uid,
        name: name.trim(),
        kind: 'other',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setName('')
      setShowForm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-gray-500">Brokers, sellers, investors — everyone in your network.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New contact
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            autoFocus
            required
            placeholder="Contact name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: 'var(--border)' }}
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-500">No contacts yet — add your first one above.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              to={`/app/contacts/${contact.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>{contact.name}</span>
              <span className="text-xs text-gray-500 capitalize">{contact.kind}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
