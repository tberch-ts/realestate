import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import type { DealInput, LoiInput } from '@mfa/shared'
import { ChevronDown, Download, Mail, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { downloadLoiPdf, sendPostgridLetter } from '../lib/api'
import type { Loi as LoiRecord } from '../lib/collections'
import type { Contact, UserProfile } from '../lib/collections'

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const LABEL = 'text-xs text-gray-500 block mb-1'

function formatMailingAddress(a?: { addressLine1?: string; addressLine2?: string; city?: string; stateCode?: string; zip?: string }) {
  if (!a?.addressLine1) return undefined
  return [a.addressLine1, a.addressLine2, [a.city, a.stateCode].filter(Boolean).join(', '), a.zip].filter(Boolean).join(', ')
}

function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>
}

export default function Loi() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [lois, setLois] = useState<LoiRecord[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [sender, setSender] = useState<UserProfile['postgridSender']>()
  const [showForm, setShowForm] = useState(!!params.get('address'))
  const [address, setAddress] = useState(params.get('address') ?? '')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const unsubLois = onSnapshot(query(collection(db, 'lois'), where('ownerId', '==', user.uid)), (snap) =>
      setLois(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LoiRecord))
    )
    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('ownerId', '==', user.uid)), (snap) =>
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact))
    )
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => setSender((snap.data() as UserProfile | undefined)?.postgridSender))
    return () => {
      unsubLois()
      unsubContacts()
      unsubUser()
    }
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !address.trim()) return
    setBusy(true)
    try {
      const unitsParam = params.get('units')
      // We're almost always the buyer on a new LOI — carry over the sender
      // profile from Settings and the signed-in user instead of making them
      // retype their own company's info on every deal.
      const buyerFromProfile = compact({
        buyerEntity: sender?.companyName,
        buyerContact: user.displayName ?? undefined,
        buyerEmail: user.email ?? undefined,
        buyerAddress: formatMailingAddress(sender),
      })
      const ref = await addDoc(collection(db, 'lois'), {
        ownerId: user.uid,
        members: [],
        address: address.trim(),
        ...(unitsParam ? { units: Number(unitsParam) } : {}),
        ...buyerFromProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setAddress('')
      setShowForm(false)
      setOpenId(ref.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this LOI?')) return
    await deleteDoc(doc(db, 'lois', id))
    if (openId === id) setOpenId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">LOIs</h1>
          <p className="text-sm text-gray-500">Letters of intent, drafted, downloaded, and mailed per deal.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} /> New LOI
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input
            autoFocus required placeholder="Property address" value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent" style={{ borderColor: 'var(--border)' }}
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {lois.length === 0 ? (
        <p className="text-sm text-gray-500">No LOIs yet — add your first one above.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {lois.map((loi) => (
            <div key={loi.id} className="border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setOpenId(openId === loi.id ? null : loi.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-white/5 transition-colors"
              >
                <span>{loi.address}</span>
                <div className="flex items-center gap-3">
                  {loi.postgridStatus && (
                    <span className="text-xs px-2 py-0.5 rounded-full text-emerald-300" style={{ border: '1px solid rgba(16,185,129,0.4)' }}>
                      mailed · {loi.postgridStatus}
                    </span>
                  )}
                  <Trash2 size={14} className="text-gray-500 hover:text-rose-400 transition-colors" onClick={(e) => { e.stopPropagation(); handleDelete(loi.id) }} />
                  <ChevronDown size={14} className={`text-gray-500 transition-transform ${openId === loi.id ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {openId === loi.id && (
                <LoiEditor
                  loi={loi}
                  contacts={contacts}
                  sender={sender}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoiEditor({ loi, contacts, sender }: { loi: LoiRecord; contacts: Contact[]; sender: UserProfile['postgridSender'] }) {
  const [downloading, setDownloading] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [mailError, setMailError] = useState<string | null>(null)

  async function patch(field: keyof LoiRecord, value: unknown) {
    await updateDoc(doc(db, 'lois', loi.id), { [field]: value, updatedAt: serverTimestamp() })
  }

  function patchOnBlur(field: keyof LoiRecord, kind: 'string' | 'number' | 'array' = 'string') {
    return (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value
      if (kind === 'number') return patch(field, raw === '' ? undefined : Number(raw))
      if (kind === 'array') return patch(field, raw.split('\n').map((s) => s.trim()).filter(Boolean))
      patch(field, raw)
    }
  }

  function handleContactLink(e: React.ChangeEvent<HTMLSelectElement>) {
    const contactId = e.target.value || undefined
    patch('contactId', contactId)
    if (!contactId) return
    const c = contacts.find((x) => x.id === contactId)
    if (!c) return
    // Pull seller entity/contact/address straight from the linked contact
    // (same buyer-vs-firm convention used for PostGrid mail below) instead
    // of leaving the user to retype data already in their contact book.
    const isFirm = c.kind === 'firm'
    const updates = compact({
      sellerEntity: loi.sellerEntity ? undefined : (isFirm ? c.name : c.firmName || c.name),
      sellerContact: loi.sellerContact ? undefined : (isFirm ? undefined : c.name),
      sellerAddress: loi.sellerAddress ? undefined : formatMailingAddress(c),
    })
    if (Object.keys(updates).length) updateDoc(doc(db, 'lois', loi.id), { ...updates, updatedAt: serverTimestamp() })
  }

  function buildDealInput(): DealInput {
    return {
      address: loi.address,
      name: loi.dealName,
      assetClass: loi.assetClass,
      underwriting: { purchasePrice: loi.purchasePrice, units: loi.units } as DealInput['underwriting'],
    }
  }

  function buildLoiInput(): LoiInput {
    return {
      buyerEntity: loi.buyerEntity ?? '',
      buyerContact: loi.buyerContact,
      buyerAddress: loi.buyerAddress,
      buyerEmail: loi.buyerEmail,
      buyerPhone: loi.buyerPhone,
      sellerEntity: loi.sellerEntity ?? '',
      sellerContact: loi.sellerContact,
      sellerAddress: loi.sellerAddress,
      effectiveDate: loi.effectiveDate ?? new Date().toISOString().slice(0, 10),
      expirationDate: loi.expirationDate ?? new Date().toISOString().slice(0, 10),
      closingDays: loi.closingDays ?? 30,
      inspectionDays: loi.inspectionDays ?? 21,
      financingDays: loi.financingDays,
      earnestMoney: loi.earnestMoney ?? 0,
      additionalDeposit: loi.additionalDeposit,
      earnestMoneyRefundable: loi.earnestMoneyRefundable ?? true,
      assignmentRights: loi.assignmentRights ?? true,
      financingContingency: loi.financingContingency ?? true,
      inspectionContingency: loi.inspectionContingency ?? true,
      titleReviewDays: loi.titleReviewDays ?? 14,
      ddMaterials: loi.ddMaterials ?? [],
      specialTerms: loi.specialTerms,
      brokerFee: loi.brokerFee,
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await downloadLoiPdf(buildDealInput(), buildLoiInput())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LOI-${loi.address.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const linkedContact = contacts.find((c) => c.id === loi.contactId)
  const canMail = !!sender?.addressLine1 && !!linkedContact?.addressLine1

  async function handleMail() {
    if (!linkedContact || !sender?.addressLine1) return
    setMailing(true)
    setMailError(null)
    try {
      const isFirm = linkedContact.kind === 'firm'
      const nameParts = linkedContact.name.trim().split(/\s+/)
      const result = await sendPostgridLetter({
        to: {
          firstName: isFirm ? undefined : nameParts[0],
          lastName: isFirm ? undefined : nameParts.slice(1).join(' ') || undefined,
          companyName: isFirm ? linkedContact.name : linkedContact.firmName,
          addressLine1: linkedContact.addressLine1!,
          addressLine2: linkedContact.addressLine2,
          city: linkedContact.city!,
          provinceOrState: linkedContact.stateCode!,
          postalOrZip: linkedContact.zip!,
        },
        from: {
          companyName: sender.companyName,
          addressLine1: sender.addressLine1!,
          addressLine2: sender.addressLine2,
          city: sender.city!,
          provinceOrState: sender.stateCode!,
          postalOrZip: sender.zip!,
        },
        deal: buildDealInput(),
        loi: buildLoiInput(),
        subject: `LOI for ${loi.address}`,
      })
      await patch('postgridLetterId', result.id)
      await patch('postgridStatus', result.status)
      await patch('mailedAt', serverTimestamp())
      if (loi.contactId) {
        await addDoc(collection(db, 'contacts', loi.contactId, 'interactions'), {
          ownerId: loi.ownerId,
          kind: 'outreach_sent',
          subject: `LOI mailed for ${loi.address}`,
          body: `Sent via PostGrid (${result.live ? 'LIVE' : 'TEST'}). Letter ID: ${result.id}. Status: ${result.status}.`,
          occurredAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        })
      }
    } catch (err) {
      setMailError((err as Error).message)
    } finally {
      setMailing(false)
    }
  }

  return (
    <div className="px-4 pb-5 space-y-5 border-t" style={{ borderColor: 'var(--border)' }}>
      <Section title="Deal">
        <Grid cols={3}>
          <Field label="Deal name"><input className={INPUT} style={bd} defaultValue={loi.dealName ?? ''} onBlur={patchOnBlur('dealName')} /></Field>
          <Field label="Asset class">
            <select className={INPUT} style={bd} defaultValue={loi.assetClass ?? ''} onChange={(e) => patch('assetClass', e.target.value || undefined)}>
              <option value="" className="bg-slate-900">—</option>
              {['A', 'B', 'C', 'D', 'unknown'].map((c) => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
            </select>
          </Field>
          <Field label="Link to contact (seller)">
            <select className={INPUT} style={bd} defaultValue={loi.contactId ?? ''} onChange={handleContactLink}>
              <option value="" className="bg-slate-900">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
            </select>
          </Field>
        </Grid>
        <Grid cols={2}>
          <Field label="Purchase price"><input type="number" className={INPUT} style={bd} defaultValue={loi.purchasePrice ?? ''} onBlur={patchOnBlur('purchasePrice', 'number')} /></Field>
          <Field label="Units"><input type="number" className={INPUT} style={bd} defaultValue={loi.units ?? ''} onBlur={patchOnBlur('units', 'number')} /></Field>
        </Grid>
      </Section>

      <Section title="Buyer">
        <Grid cols={2}>
          <Field label="Entity *"><input className={INPUT} style={bd} defaultValue={loi.buyerEntity ?? ''} onBlur={patchOnBlur('buyerEntity')} /></Field>
          <Field label="Contact"><input className={INPUT} style={bd} defaultValue={loi.buyerContact ?? ''} onBlur={patchOnBlur('buyerContact')} /></Field>
          <Field label="Email"><input type="email" className={INPUT} style={bd} defaultValue={loi.buyerEmail ?? ''} onBlur={patchOnBlur('buyerEmail')} /></Field>
          <Field label="Phone"><input type="tel" className={INPUT} style={bd} defaultValue={loi.buyerPhone ?? ''} onBlur={patchOnBlur('buyerPhone')} /></Field>
        </Grid>
        <Field label="Address"><input className={INPUT} style={bd} defaultValue={loi.buyerAddress ?? ''} onBlur={patchOnBlur('buyerAddress')} /></Field>
      </Section>

      {/* Keyed on contactId so these uncontrolled fields re-initialize from
          the freshly-autofilled Firestore doc when a contact gets linked. */}
      <Section title="Seller" key={loi.contactId ?? 'none'}>
        <Grid cols={2}>
          <Field label="Entity *"><input className={INPUT} style={bd} defaultValue={loi.sellerEntity ?? ''} onBlur={patchOnBlur('sellerEntity')} /></Field>
          <Field label="Contact"><input className={INPUT} style={bd} defaultValue={loi.sellerContact ?? ''} onBlur={patchOnBlur('sellerContact')} /></Field>
        </Grid>
        <Field label="Address"><input className={INPUT} style={bd} defaultValue={loi.sellerAddress ?? ''} onBlur={patchOnBlur('sellerAddress')} /></Field>
      </Section>

      <Section title="Terms">
        <Grid cols={3}>
          <Field label="Effective date"><input type="date" className={INPUT} style={bd} defaultValue={loi.effectiveDate ?? ''} onBlur={patchOnBlur('effectiveDate')} /></Field>
          <Field label="Expiration date"><input type="date" className={INPUT} style={bd} defaultValue={loi.expirationDate ?? ''} onBlur={patchOnBlur('expirationDate')} /></Field>
          <Field label="Closing days"><input type="number" className={INPUT} style={bd} defaultValue={loi.closingDays ?? ''} onBlur={patchOnBlur('closingDays', 'number')} /></Field>
          <Field label="Inspection (DD) days"><input type="number" className={INPUT} style={bd} defaultValue={loi.inspectionDays ?? ''} onBlur={patchOnBlur('inspectionDays', 'number')} /></Field>
          <Field label="Financing days"><input type="number" className={INPUT} style={bd} defaultValue={loi.financingDays ?? ''} onBlur={patchOnBlur('financingDays', 'number')} /></Field>
          <Field label="Title review days"><input type="number" className={INPUT} style={bd} defaultValue={loi.titleReviewDays ?? ''} onBlur={patchOnBlur('titleReviewDays', 'number')} /></Field>
          <Field label="Earnest money $"><input type="number" className={INPUT} style={bd} defaultValue={loi.earnestMoney ?? ''} onBlur={patchOnBlur('earnestMoney', 'number')} /></Field>
          <Field label="Additional deposit $"><input type="number" className={INPUT} style={bd} defaultValue={loi.additionalDeposit ?? ''} onBlur={patchOnBlur('additionalDeposit', 'number')} /></Field>
          <Field label="Broker fee"><input className={INPUT} style={bd} defaultValue={loi.brokerFee ?? ''} onBlur={patchOnBlur('brokerFee')} /></Field>
        </Grid>
      </Section>

      <Section title="Contingencies">
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Earnest money refundable" checked={loi.earnestMoneyRefundable ?? true} onChange={(v) => patch('earnestMoneyRefundable', v)} />
          <Checkbox label="Assignment rights" checked={loi.assignmentRights ?? true} onChange={(v) => patch('assignmentRights', v)} />
          <Checkbox label="Financing contingency" checked={loi.financingContingency ?? true} onChange={(v) => patch('financingContingency', v)} />
          <Checkbox label="Inspection contingency" checked={loi.inspectionContingency ?? true} onChange={(v) => patch('inspectionContingency', v)} />
        </div>
        <Field label="Due diligence materials requested (one per line)">
          <textarea rows={3} className={INPUT} style={bd} defaultValue={(loi.ddMaterials ?? []).join('\n')} onBlur={patchOnBlur('ddMaterials', 'array')} />
        </Field>
        <Field label="Special terms"><textarea rows={2} className={INPUT} style={bd} defaultValue={loi.specialTerms ?? ''} onBlur={patchOnBlur('specialTerms')} /></Field>
      </Section>

      <Section title="Notes">
        <textarea rows={2} className={INPUT} style={bd} defaultValue={loi.notes ?? ''} onBlur={patchOnBlur('notes')} />
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-white/5 transition-colors disabled:opacity-50" style={bd}>
          <Download size={14} /> {downloading ? 'Generating…' : 'Download PDF'}
        </button>
        <button
          onClick={handleMail}
          disabled={!canMail || mailing}
          title={!canMail ? 'Link a contact with a full mailing address, and set your sender address in Settings' : undefined}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          <Mail size={14} /> {mailing ? 'Sending…' : 'Mail via PostGrid'}
        </button>
        {mailError && <span className="text-xs text-rose-400">{mailError}</span>}
      </div>
    </div>
  )
}

const bd = { borderColor: 'var(--border)' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div className={`grid gap-3 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
