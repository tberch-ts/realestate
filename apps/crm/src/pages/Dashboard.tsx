import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Kanban, Users, FileText } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { Deal, Contact, Loi } from '../lib/collections'

export default function Dashboard() {
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [lois, setLois] = useState<Loi[]>([])

  useEffect(() => {
    if (!user) return
    const unsubDeals = onSnapshot(query(collection(db, 'deals'), where('userId', '==', user.uid)), (snap) =>
      setDeals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Deal))
    )
    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('userId', '==', user.uid)), (snap) =>
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact))
    )
    const unsubLois = onSnapshot(query(collection(db, 'lois'), where('userId', '==', user.uid)), (snap) =>
      setLois(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Loi))
    )
    return () => {
      unsubDeals()
      unsubContacts()
      unsubLois()
    }
  }, [user])

  const activeDeals = deals.filter((d) => d.status !== 'closed')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Welcome back{user?.displayName ? `, ${user.displayName}` : ''}</h1>
      <p className="text-sm text-gray-500 mb-8">Here's where your pipeline stands.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link to="/app/deals" className="rounded-xl border p-5 hover:border-gray-500 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Kanban size={18} className="text-blue-400 mb-3" />
          <p className="text-2xl font-bold">{activeDeals.length}</p>
          <p className="text-xs text-gray-500">Active deals</p>
        </Link>
        <Link to="/app/contacts" className="rounded-xl border p-5 hover:border-gray-500 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Users size={18} className="text-emerald-400 mb-3" />
          <p className="text-2xl font-bold">{contacts.length}</p>
          <p className="text-xs text-gray-500">Contacts</p>
        </Link>
        <Link to="/app/loi" className="rounded-xl border p-5 hover:border-gray-500 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <FileText size={18} className="text-amber-400 mb-3" />
          <p className="text-2xl font-bold">{lois.length}</p>
          <p className="text-xs text-gray-500">LOIs drafted</p>
        </Link>
      </div>

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent deals</h2>
      {deals.length === 0 ? (
        <p className="text-sm text-gray-500">
          No deals yet — <Link to="/app/deals" className="text-blue-400 hover:underline">add your first one</Link>.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {deals.slice(0, 5).map((deal) => (
            <Link
              key={deal.id}
              to={`/app/deals/${deal.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm border-t first:border-t-0 hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>{deal.address}</span>
              <span className="text-xs text-gray-500">{deal.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
