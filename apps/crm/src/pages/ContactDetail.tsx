import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { Mail, Send, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { sendPostgridLetter } from '../lib/api'
import {
  CONTACT_KINDS, INTERACTION_KINDS, INTERACTION_KIND_LABELS,
  type Contact, type Interaction, type UserProfile,
} from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [sender, setSender] = useState<UserProfile['postgridSender']>()

  useEffect(() => {
    if (!id) return
    return onSnapshot(
      doc(db, 'contacts', id),
      (snap) => {
        if (!snap.exists()) return setNotFound(true)
        setContact({ id: snap.id, ...snap.data() } as Contact)
      },
      () => setNotFound(true)
    )
  }, [id])

  useEffect(() => {
    if (!id || !user) return
    return onSnapshot(
      query(collection(db, 'contacts', id, 'interactions'), where('ownerId', '==', user.uid), orderBy('occurredAt', 'desc')),
      (snap) => setInteractions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Interaction))
    )
  }, [id, user])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => setSender((snap.data() as UserProfile | undefined)?.postgridSender))
  }, [user])

  async function handleChange(field: keyof Contact, value: string) {
    if (!id) return
    await updateDoc(doc(db, 'contacts', id), { [field]: value, updatedAt: serverTimestamp() })
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this contact?')) return
    await deleteDoc(doc(db, 'contacts', id))
    navigate('/app/contacts')
  }

  async function logInteraction(input: Omit<Interaction, 'id' | 'ownerId' | 'createdAt'>) {
    if (!id || !contact) return
    await addDoc(collection(db, 'contacts', id, 'interactions'), {
      ...input,
      ownerId: contact.ownerId,
      occurredAt: input.occurredAt ?? serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  }

  if (notFound) return <p className="text-sm text-gray-500">Contact not found.</p>
  if (!contact) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{contact.name}</h1>
        <button onClick={handleDelete} className="text-gray-500 hover:text-rose-400 transition-colors">
          <Trash2 size={18} />
        </button>
      </div>

      <Section title="Details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={INPUT} style={bd} defaultValue={contact.name} onBlur={(e) => handleChange('name', e.target.value)} /></Field>
          <Field label="Type">
            <select className={INPUT} style={bd} value={contact.kind} onChange={(e) => handleChange('kind', e.target.value)}>
              {CONTACT_KINDS.map((k) => <option key={k} value={k} className="bg-slate-900 capitalize">{k}</option>)}
            </select>
          </Field>
          <Field label="Firm name"><input className={INPUT} style={bd} defaultValue={contact.firmName ?? ''} onBlur={(e) => handleChange('firmName', e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={INPUT} style={bd} defaultValue={contact.email ?? ''} onBlur={(e) => handleChange('email', e.target.value)} /></Field>
          <Field label="Phone"><input type="tel" className={INPUT} style={bd} defaultValue={contact.phone ?? ''} onBlur={(e) => handleChange('phone', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Mailing address">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Address line 1"><input className={INPUT} style={bd} defaultValue={contact.addressLine1 ?? ''} onBlur={(e) => handleChange('addressLine1', e.target.value)} /></Field>
          <Field label="Address line 2"><input className={INPUT} style={bd} defaultValue={contact.addressLine2 ?? ''} onBlur={(e) => handleChange('addressLine2', e.target.value)} /></Field>
          <Field label="City"><input className={INPUT} style={bd} defaultValue={contact.city ?? ''} onBlur={(e) => handleChange('city', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State"><input className={INPUT} style={bd} defaultValue={contact.stateCode ?? ''} onBlur={(e) => handleChange('stateCode', e.target.value)} /></Field>
            <Field label="ZIP"><input className={INPUT} style={bd} defaultValue={contact.zip ?? ''} onBlur={(e) => handleChange('zip', e.target.value)} /></Field>
          </div>
        </div>
      </Section>

      <Section title="Notes">
        <textarea rows={3} className={INPUT} style={bd} defaultValue={contact.notes ?? ''} onBlur={(e) => handleChange('notes', e.target.value)} />
      </Section>

      {/* Keyed on contact id so the greeting/subject re-derive fresh per
          contact instead of carrying over a stale draft if the route param
          changes without a full remount. */}
      <OutreachComposer key={contact.id} contact={contact} sender={sender} onLogged={logInteraction} />

      <ManualLogForm onLog={logInteraction} />

      <Section title="Timeline">
        {interactions.length === 0 ? (
          <p className="text-sm text-gray-500">No activity logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {interactions.map((i) => (
              <li key={i.id} className="rounded-lg border p-3 text-sm" style={bd}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{INTERACTION_KIND_LABELS[i.kind]}</span>
                  <span className="text-xs text-gray-500">{fmtTimestamp(i.occurredAt)}</span>
                </div>
                {i.subject && <p className="text-gray-300">{i.subject}</p>}
                {i.body && <p className="text-gray-500 text-xs mt-1 whitespace-pre-wrap">{i.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function OutreachComposer({
  contact, sender, onLogged,
}: {
  contact: Contact
  sender: UserProfile['postgridSender']
  onLogged: (input: Omit<Interaction, 'id' | 'ownerId' | 'createdAt'>) => Promise<void>
}) {
  // Greet the contact by name and drop the firm into the subject line by
  // default — the message text itself is still up to the user, but they
  // shouldn't have to retype who they're writing to.
  const [subject, setSubject] = useState(() => `Reaching out — ${contact.firmName || contact.name}`)
  const [body, setBody] = useState(() => {
    const firstName = contact.kind === 'firm' ? contact.name : contact.name.trim().split(/\s+/)[0]
    return `Hi ${firstName},\n\n`
  })
  const [sendingMail, setSendingMail] = useState(false)
  const [mailError, setMailError] = useState<string | null>(null)

  function sendEmail() {
    if (!contact.email) return
    const url = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    onLogged({ kind: 'outreach_sent', subject: subject || 'Email', body: `To: ${contact.email}\n\n${body}` })
  }

  const canMailPostal = !!sender?.addressLine1 && !!contact.addressLine1

  async function sendPostalLetter() {
    if (!canMailPostal) return
    setSendingMail(true)
    setMailError(null)
    try {
      const isFirm = contact.kind === 'firm'
      const nameParts = contact.name.trim().split(/\s+/)
      const result = await sendPostgridLetter({
        to: {
          firstName: isFirm ? undefined : nameParts[0],
          lastName: isFirm ? undefined : nameParts.slice(1).join(' ') || undefined,
          companyName: isFirm ? contact.name : contact.firmName,
          addressLine1: contact.addressLine1!,
          addressLine2: contact.addressLine2,
          city: contact.city!,
          provinceOrState: contact.stateCode!,
          postalOrZip: contact.zip!,
        },
        from: {
          companyName: sender!.companyName,
          addressLine1: sender!.addressLine1!,
          addressLine2: sender!.addressLine2,
          city: sender!.city!,
          provinceOrState: sender!.stateCode!,
          postalOrZip: sender!.zip!,
        },
        html: `<p>${body.replace(/\n/g, '</p><p>')}</p>`,
        subject,
      })
      await onLogged({
        kind: 'outreach_sent',
        subject: subject || 'Postal letter',
        body: `Sent via PostGrid (${result.live ? 'LIVE' : 'TEST'}). Letter ID: ${result.id}. Status: ${result.status}.\n\n${body}`,
      })
      setSubject('')
      setBody('')
    } catch (err) {
      setMailError((err as Error).message)
    } finally {
      setSendingMail(false)
    }
  }

  return (
    <Section title="Send outreach">
      <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} style={bd} />
      <textarea rows={3} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} className={INPUT} style={bd} />
      <div className="flex items-center gap-3">
        <button
          onClick={sendEmail}
          disabled={!contact.email}
          title={!contact.email ? 'Add an email address first' : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border hover:bg-white/5 transition-colors disabled:opacity-50"
          style={bd}
        >
          <Mail size={14} /> Email
        </button>
        <button
          onClick={sendPostalLetter}
          disabled={!canMailPostal || sendingMail}
          title={!canMailPostal ? 'Contact needs a full address and you need a sender address set in Settings' : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          <Send size={14} /> {sendingMail ? 'Sending…' : 'Postal letter'}
        </button>
        {mailError && <span className="text-xs text-rose-400">{mailError}</span>}
      </div>
    </Section>
  )
}

function ManualLogForm({ onLog }: { onLog: (input: Omit<Interaction, 'id' | 'ownerId' | 'createdAt'>) => Promise<void> }) {
  const [kind, setKind] = useState<Interaction['kind']>('note')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onLog({ kind, subject: subject || undefined, body: body || undefined })
    setSubject('')
    setBody('')
  }

  return (
    <Section title="Log activity">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <select className={INPUT} style={bd} value={kind} onChange={(e) => setKind(e.target.value as Interaction['kind'])}>
            {INTERACTION_KINDS.map((k) => <option key={k} value={k} className="bg-slate-900">{INTERACTION_KIND_LABELS[k]}</option>)}
          </select>
          <input placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} style={bd} />
        </div>
        <textarea rows={2} placeholder="Notes (optional)" value={body} onChange={(e) => setBody(e.target.value)} className={INPUT} style={bd} />
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors">
          Log
        </button>
      </form>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  )
}

function fmtTimestamp(ts: unknown): string {
  const t = ts as { toDate?: () => Date } | undefined
  if (t?.toDate) return t.toDate().toLocaleString()
  return ''
}
