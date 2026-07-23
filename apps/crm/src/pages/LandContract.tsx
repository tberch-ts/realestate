import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { FileSignature, Landmark, Mail, MailCheck, ShieldAlert } from 'lucide-react'
import type { AssignmentContractInput, LandContractInput } from '@mfa/shared'
import { downloadAssignmentContractPdf, downloadLandContractPdf, sendPostgridLetter } from '../lib/api'
import { builderAssignmentEmail, sellerContractEmail, titleCompanyEmail } from '../lib/contractEmail'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/firebase'
import type { UserProfile } from '../lib/collections'

// Both contracts of the flip, plus the escrow flow that protects them:
//   1. Seller P&S — you sign as "Buyer and/or assigns", feasibility +
//      clear-title exits, zero capital at risk.
//   2. Builder assignment — assigns the P&S to the builder; your fee is
//      paid at closing through escrow.
// The title company (closing agent) is the neutral third party holding
// BOTH documents and all funds — it's CC'd on every contract email and
// gets its own "open escrow" email. mailto can't attach files, so each
// email button downloads/expects the PDF and the user attaches it.

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

type Tab = 'seller' | 'assignment'

export default function LandContract() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'seller')
  const [sender, setSender] = useState<UserProfile['postgridSender']>()

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => setSender((snap.data() as UserProfile | undefined)?.postgridSender))
  }, [user])

  // ---- shared across both contracts ----
  const [buyerName, setBuyerName] = useState(user?.displayName ?? '')
  const [sellerNames, setSellerNames] = useState(params.get('seller') ?? '')
  const [address, setAddress] = useState(params.get('address') ?? '')
  const [parcelId, setParcelId] = useState(params.get('parcelId') ?? '')
  const [legalDescription, setLegalDescription] = useState('')
  const [purchasePrice, setPurchasePrice] = useState(params.get('price') ?? '')
  const [closingAgentName, setClosingAgentName] = useState('')
  const [closingAgentAddress, setClosingAgentAddress] = useState('')
  const [titleEmail, setTitleEmail] = useState('')

  // ---- seller contract ----
  const [feasibilityDays, setFeasibilityDays] = useState('30')
  const [earnestMoney, setEarnestMoney] = useState('100')
  const [closingDate, setClosingDate] = useState('')
  const [specialTerms, setSpecialTerms] = useState('')
  const [sellerEmail, setSellerEmail] = useState('')
  const [sellerAddressLine1, setSellerAddressLine1] = useState('')
  const [sellerCity, setSellerCity] = useState('')
  const [sellerState, setSellerState] = useState('')
  const [sellerZip, setSellerZip] = useState('')

  // ---- assignment ----
  const [builderName, setBuilderName] = useState(params.get('builder') ?? '')
  const [builderEmail, setBuilderEmail] = useState('')
  const [assignmentFee, setAssignmentFee] = useState(params.get('fee') ?? '')
  const [agreementDate, setAgreementDate] = useState(new Date().toISOString().slice(0, 10))
  const [builderAddressLine1, setBuilderAddressLine1] = useState('')
  const [builderCity, setBuilderCity] = useState('')
  const [builderState, setBuilderState] = useState('')
  const [builderZip, setBuilderZip] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mailingSeller, setMailingSeller] = useState(false)
  const [mailSellerError, setMailSellerError] = useState<string | null>(null)
  const [mailSellerResult, setMailSellerResult] = useState<string | null>(null)
  const [mailingAssignment, setMailingAssignment] = useState(false)
  const [mailAssignmentError, setMailAssignmentError] = useState<string | null>(null)
  const [mailAssignmentResult, setMailAssignmentResult] = useState<string | null>(null)

  const emailCtx = {
    address: address.trim() || undefined,
    parcelId: parcelId.trim() || undefined,
    senderName: buyerName.trim() || undefined,
    titleCompany: closingAgentName.trim() || undefined,
    price: numOrUndef(purchasePrice),
    assignmentFee: numOrUndef(assignmentFee),
    builderName: builderName.trim() || undefined,
    sellerNames: sellerNames.trim() || undefined,
    feasibilityDays: numOrUndef(feasibilityDays),
  }

  async function generateSeller() {
    setBusy(true)
    setError(null)
    try {
      const input: LandContractInput = {
        sellerNames: sellerNames.trim(),
        buyerName: buyerName.trim(),
        address: address.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        legalDescription: legalDescription.trim() || undefined,
        purchasePrice: Number(purchasePrice),
        feasibilityDays: Number(feasibilityDays) || 30,
        closingAgentName: closingAgentName.trim(),
        closingAgentAddress: closingAgentAddress.trim() || undefined,
        earnestMoney: Number(earnestMoney) || 0,
        effectiveDate: new Date().toISOString().slice(0, 10),
        closingDate: closingDate || undefined,
        specialTerms: specialTerms.trim() || undefined,
      }
      saveBlob(await downloadLandContractPdf(input), 'land-purchase-agreement.pdf')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function generateAssignment() {
    setBusy(true)
    setError(null)
    try {
      const input: AssignmentContractInput = {
        assignorName: buyerName.trim(),
        assigneeName: builderName.trim(),
        sellerNames: sellerNames.trim(),
        originalAgreementDate: agreementDate,
        address: address.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        legalDescription: legalDescription.trim() || undefined,
        originalPrice: Number(purchasePrice),
        assignmentFee: Number(assignmentFee),
        closingAgentName: closingAgentName.trim(),
        closingAgentAddress: closingAgentAddress.trim() || undefined,
        effectiveDate: new Date().toISOString().slice(0, 10),
        closingDate: closingDate || undefined,
      }
      saveBlob(await downloadAssignmentContractPdf(input), 'assignment-of-contract.pdf')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const canMailSeller = !!sender?.addressLine1 && !!sellerAddressLine1.trim() && !!sellerCity.trim() && !!sellerState.trim() && !!sellerZip.trim()
  const canMailAssignment = !!sender?.addressLine1 && !!builderAddressLine1.trim() && !!builderCity.trim() && !!builderState.trim() && !!builderZip.trim()

  async function handleMailSeller() {
    if (!sender?.addressLine1 || !canMailSeller) return
    setMailingSeller(true)
    setMailSellerError(null)
    setMailSellerResult(null)
    try {
      const input: LandContractInput = {
        sellerNames: sellerNames.trim(),
        buyerName: buyerName.trim(),
        address: address.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        legalDescription: legalDescription.trim() || undefined,
        purchasePrice: Number(purchasePrice),
        feasibilityDays: Number(feasibilityDays) || 30,
        closingAgentName: closingAgentName.trim(),
        closingAgentAddress: closingAgentAddress.trim() || undefined,
        earnestMoney: Number(earnestMoney) || 0,
        effectiveDate: new Date().toISOString().slice(0, 10),
        closingDate: closingDate || undefined,
        specialTerms: specialTerms.trim() || undefined,
      }
      const result = await sendPostgridLetter({
        to: {
          companyName: sellerNames.trim(),
          addressLine1: sellerAddressLine1.trim(),
          city: sellerCity.trim(),
          provinceOrState: sellerState.trim(),
          postalOrZip: sellerZip.trim(),
        },
        from: {
          companyName: sender.companyName,
          addressLine1: sender.addressLine1!,
          addressLine2: sender.addressLine2,
          city: sender.city!,
          provinceOrState: sender.stateCode!,
          postalOrZip: sender.zip!,
        },
        landContract: input,
        subject: `Purchase agreement for ${address.trim() || sellerNames.trim()}`,
      })
      setMailSellerResult(`Mailed — status: ${result.status} (${result.live ? 'LIVE' : 'TEST'})`)
    } catch (err) {
      setMailSellerError((err as Error).message)
    } finally {
      setMailingSeller(false)
    }
  }

  async function handleMailAssignment() {
    if (!sender?.addressLine1 || !canMailAssignment) return
    setMailingAssignment(true)
    setMailAssignmentError(null)
    setMailAssignmentResult(null)
    try {
      const input: AssignmentContractInput = {
        assignorName: buyerName.trim(),
        assigneeName: builderName.trim(),
        sellerNames: sellerNames.trim(),
        originalAgreementDate: agreementDate,
        address: address.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        legalDescription: legalDescription.trim() || undefined,
        originalPrice: Number(purchasePrice),
        assignmentFee: Number(assignmentFee),
        closingAgentName: closingAgentName.trim(),
        closingAgentAddress: closingAgentAddress.trim() || undefined,
        effectiveDate: new Date().toISOString().slice(0, 10),
        closingDate: closingDate || undefined,
      }
      const result = await sendPostgridLetter({
        to: {
          companyName: builderName.trim(),
          addressLine1: builderAddressLine1.trim(),
          city: builderCity.trim(),
          provinceOrState: builderState.trim(),
          postalOrZip: builderZip.trim(),
        },
        from: {
          companyName: sender.companyName,
          addressLine1: sender.addressLine1!,
          addressLine2: sender.addressLine2,
          city: sender.city!,
          provinceOrState: sender.stateCode!,
          postalOrZip: sender.zip!,
        },
        assignmentContract: input,
        subject: `Assignment of contract for ${address.trim() || sellerNames.trim()}`,
      })
      setMailAssignmentResult(`Mailed — status: ${result.status} (${result.live ? 'LIVE' : 'TEST'})`)
    } catch (err) {
      setMailAssignmentError((err as Error).message)
    } finally {
      setMailingAssignment(false)
    }
  }

  const spread = numOrUndef(assignmentFee)
  const price = numOrUndef(purchasePrice)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Contracts</h1>
      <p className="text-sm text-gray-500 mb-4">
        Two documents complete the flip: the seller purchase agreement ("Buyer and/or assigns") and the
        builder assignment. The title company holds both in escrow — that's what protects the contracts
        and gets your fee paid at closing.
      </p>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 mb-5 text-xs text-amber-200">
        <ShieldAlert size={15} className="shrink-0 mt-0.5" />
        <span>
          <strong>Templates only — not legal advice.</strong> Contract requirements vary by state. Have a
          licensed local real-estate attorney review before use.
        </span>
      </div>

      {/* ---- shared: property + title company ---- */}
      <SectionLabel icon={<Landmark size={13} />} text="Property & title company (shared by both contracts)" />
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name (Buyer / Assignor)" required>
            <input required className={INPUT} style={bd} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your name / your LLC" />
          </Field>
          <Field label="Seller name(s)" required>
            <input required className={INPUT} style={bd} value={sellerNames} onChange={(e) => setSellerNames(e.target.value)} placeholder="Jane Doe and John Doe" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property address">
            <input className={INPUT} style={bd} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Parcel ID">
            <input className={INPUT} style={bd} value={parcelId} onChange={(e) => setParcelId(e.target.value)} />
          </Field>
        </div>
        <Field label="Legal description">
          <textarea rows={2} className={INPUT} style={bd} value={legalDescription} onChange={(e) => setLegalDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Purchase price $ (to seller)" required>
            <input required type="number" className={INPUT} style={bd} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="60000" />
          </Field>
          <Field label="Title company / closing agent" required>
            <input required className={INPUT} style={bd} value={closingAgentName} onChange={(e) => setClosingAgentName(e.target.value)} placeholder="ABC Title LLC" />
          </Field>
          <Field label="Title company email">
            <input type="email" className={INPUT} style={bd} value={titleEmail} onChange={(e) => setTitleEmail(e.target.value)} placeholder="escrow@abctitle.com" />
          </Field>
        </div>
        <Field label="Title company address">
          <input className={INPUT} style={bd} value={closingAgentAddress} onChange={(e) => setClosingAgentAddress(e.target.value)} />
        </Field>
        {titleEmail.trim() && (
          <a
            href={titleCompanyEmail(titleEmail.trim(), emailCtx)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
          >
            <Mail size={12} /> Email title company: open escrow &amp; hold both contracts →
          </a>
        )}
      </div>

      {/* ---- tabs ---- */}
      <div className="flex rounded-lg border overflow-hidden text-sm mb-5 w-fit" style={bd}>
        <TabBtn active={tab === 'seller'} onClick={() => setTab('seller')} label="1. Seller contract (P&S)" />
        <TabBtn active={tab === 'assignment'} onClick={() => setTab('assignment')} label="2. Builder assignment" />
      </div>

      {tab === 'seller' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Feasibility study (days)">
              <input type="number" className={INPUT} style={bd} value={feasibilityDays} onChange={(e) => setFeasibilityDays(e.target.value)} />
            </Field>
            <Field label="Earnest money $ (held at title co.)">
              <input type="number" className={INPUT} style={bd} value={earnestMoney} onChange={(e) => setEarnestMoney(e.target.value)} />
            </Field>
            <Field label="Closing date (optional)">
              <input type="date" className={INPUT} style={bd} value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Special terms (optional)">
            <textarea rows={2} className={INPUT} style={bd} value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} />
          </Field>
          <Field label="Seller email (for sending the contract)">
            <input type="email" className={INPUT} style={bd} value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="jane@example.com" />
          </Field>

          <div>
            <p className="text-xs text-gray-500 mb-2">Seller mailing address (required to mail via PostGrid)</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-4">
                <input className={INPUT} style={bd} value={sellerAddressLine1} onChange={(e) => setSellerAddressLine1(e.target.value)} placeholder="Street address" />
              </div>
              <input className={INPUT} style={bd} value={sellerCity} onChange={(e) => setSellerCity(e.target.value)} placeholder="City" />
              <input className={INPUT} style={bd} value={sellerState} onChange={(e) => setSellerState(e.target.value)} placeholder="State" />
              <input className={INPUT} style={bd} value={sellerZip} onChange={(e) => setSellerZip(e.target.value)} placeholder="ZIP" />
            </div>
          </div>

          {error && <ErrorBox msg={error} />}
          {mailSellerError && <ErrorBox msg={mailSellerError} />}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generateSeller}
              disabled={busy || !sellerNames.trim() || !buyerName.trim() || !purchasePrice || !closingAgentName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              <FileSignature size={15} /> {busy ? 'Generating…' : 'Generate P&S PDF'}
            </button>
            <button
              onClick={handleMailSeller}
              disabled={mailingSeller || !canMailSeller || !sellerNames.trim() || !buyerName.trim() || !purchasePrice || !closingAgentName.trim()}
              title={!canMailSeller ? 'Enter the seller’s mailing address, and set your sender address in Settings' : undefined}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-50"
              style={bd}
            >
              <MailCheck size={14} /> {mailingSeller ? 'Sending…' : 'Mail via PostGrid'}
            </button>
            {sellerEmail.trim() && (
              <a
                href={sellerContractEmail(sellerEmail.trim(), emailCtx, titleEmail.trim() || undefined)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border text-gray-200 hover:bg-white/5 transition-colors"
                style={bd}
              >
                <Mail size={14} /> Email to seller{titleEmail.trim() ? ' (title co. CC’d)' : ''}
              </a>
            )}
          </div>
          {mailSellerResult && <p className="text-xs text-emerald-400">{mailSellerResult}</p>}
          <p className="text-[11px] text-gray-600">
            Generate first, then email — your mail app opens pre-written; attach the downloaded PDF. Or mail the
            signed PDF directly via PostGrid using the address above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Builder (Assignee)" required>
              <input required className={INPUT} style={bd} value={builderName} onChange={(e) => setBuilderName(e.target.value)} placeholder="Coastal Homes LLC" />
            </Field>
            <Field label="Builder email">
              <input type="email" className={INPUT} style={bd} value={builderEmail} onChange={(e) => setBuilderEmail(e.target.value)} placeholder="land@coastalhomes.com" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignment fee $ (your spread, paid at closing)" required>
              <input required type="number" className={INPUT} style={bd} value={assignmentFee} onChange={(e) => setAssignmentFee(e.target.value)} placeholder="10000" />
            </Field>
            <Field label="Date of the original P&S agreement">
              <input type="date" className={INPUT} style={bd} value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
            </Field>
          </div>

          {price != null && spread != null && (
            <div className="rounded-lg border px-4 py-3 text-sm flex items-center justify-between" style={bd}>
              <span className="text-gray-400">
                Builder pays {fmtMoney(price + spread)} → seller gets {fmtMoney(price)} → escrow disburses you
              </span>
              <span className="font-semibold text-emerald-400">{fmtMoney(spread)}</span>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500 mb-2">Builder mailing address (required to mail via PostGrid)</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-4">
                <input className={INPUT} style={bd} value={builderAddressLine1} onChange={(e) => setBuilderAddressLine1(e.target.value)} placeholder="Street address" />
              </div>
              <input className={INPUT} style={bd} value={builderCity} onChange={(e) => setBuilderCity(e.target.value)} placeholder="City" />
              <input className={INPUT} style={bd} value={builderState} onChange={(e) => setBuilderState(e.target.value)} placeholder="State" />
              <input className={INPUT} style={bd} value={builderZip} onChange={(e) => setBuilderZip(e.target.value)} placeholder="ZIP" />
            </div>
          </div>

          {error && <ErrorBox msg={error} />}
          {mailAssignmentError && <ErrorBox msg={mailAssignmentError} />}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generateAssignment}
              disabled={busy || !builderName.trim() || !buyerName.trim() || !sellerNames.trim() || !purchasePrice || !assignmentFee || !closingAgentName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              <FileSignature size={15} /> {busy ? 'Generating…' : 'Generate assignment PDF'}
            </button>
            <button
              onClick={handleMailAssignment}
              disabled={mailingAssignment || !canMailAssignment || !builderName.trim() || !buyerName.trim() || !sellerNames.trim() || !purchasePrice || !assignmentFee || !closingAgentName.trim()}
              title={!canMailAssignment ? 'Enter the builder’s mailing address, and set your sender address in Settings' : undefined}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-50"
              style={bd}
            >
              <MailCheck size={14} /> {mailingAssignment ? 'Sending…' : 'Mail via PostGrid'}
            </button>
            {builderEmail.trim() && (
              <a
                href={builderAssignmentEmail(builderEmail.trim(), emailCtx, titleEmail.trim() || undefined)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border text-gray-200 hover:bg-white/5 transition-colors"
                style={bd}
              >
                <Mail size={14} /> Email to builder{titleEmail.trim() ? ' (title co. CC’d)' : ''}
              </a>
            )}
          </div>
          {mailAssignmentResult && <p className="text-xs text-emerald-400">{mailAssignmentResult}</p>}
          <p className="text-[11px] text-gray-600">
            Generate first, then email — your mail app opens pre-written; attach the downloaded PDF. Or mail the
            signed PDF directly via PostGrid using the address above.
          </p>
        </div>
      )}
    </div>
  )
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function numOrUndef(s: string): number | undefined {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
      {icon} {text}
    </p>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 ${active ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:text-white'}`}
    >
      {label}
    </button>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">{msg}</div>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
