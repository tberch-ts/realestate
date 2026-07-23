import { useMemo, useState } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { sendSms } from '../lib/api'
import { landScripts, ownerFirstName, type ScriptContext } from '../lib/outreachScripts'
import type { Contact } from '../lib/collections'

// One-to-one SMS composer (Twilio). Parcel data has no phone numbers, so
// the number is entered manually (skip trace / lookup) and saved onto the
// contact in E.164. Sends are single-recipient by design — see
// apps/api/src/routes/sms.ts for the compliance posture.

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm bg-transparent'
const bd = { borderColor: 'var(--border)' }

export default function SmsComposer({
  contact,
  scriptCtx,
  onSaved,
  onSent,
  onClose,
}: {
  contact: Contact
  scriptCtx?: ScriptContext
  /** Persist the normalized E.164 phone onto the contact. */
  onSaved: (phoneE164: string) => Promise<void> | void
  /** Log the sms_sent interaction. */
  onSent: (to: string, body: string) => Promise<void> | void
  onClose: () => void
}) {
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [body, setBody] = useState(() =>
    landScripts({
      ownerFirstName: ownerFirstName(contact.name),
      ...scriptCtx,
    }).sms
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const e164 = useMemo(() => normalizeE164(phone), [phone])

  // Local-hour heuristic only (we don't know the recipient's timezone) —
  // a nudge, not a gate.
  const hour = new Date().getHours()
  const quietHours = hour < 8 || hour >= 21

  async function handleSend() {
    if (!e164) return
    setBusy(true)
    setError(null)
    try {
      if (e164 !== contact.phone) await onSaved(e164)
      await sendSms({ to: e164, body, contactId: contact.id })
      await onSent(e164, body)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageSquareText size={17} /> Text {contact.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <label className="text-xs text-gray-500 block mb-1">
          Phone (parcel data has no numbers — skip trace or look it up, entered once, saved to the contact)
        </label>
        <input
          className={INPUT}
          style={bd}
          placeholder="+1 919 555 1234"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {phone.trim() !== '' && !e164 && (
          <p className="text-xs text-amber-300 mt-1">Enter a full US number — it will be saved as E.164 (+1XXXXXXXXXX).</p>
        )}

        <label className="text-xs text-gray-500 block mt-3 mb-1">Message ({body.length} chars)</label>
        <textarea rows={5} className={INPUT} style={bd} value={body} onChange={(e) => setBody(e.target.value)} />

        {quietHours && (
          <p className="text-xs text-amber-300 mt-2">
            It's outside 8am–9pm where you are — make sure it isn't quiet hours where the owner is before sending.
          </p>
        )}
        <p className="text-[11px] text-gray-600 mt-2">
          One lead at a time. Identify yourself, honor STOP immediately, keep it 8am–9pm recipient time.
        </p>

        {error && <div className="mt-3 p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs">{error}</div>}
        {sent && <div className="mt-3 p-2.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs">Sent ✓ — logged to the timeline.</div>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm border text-gray-300 hover:bg-white/5" style={bd}>
            {sent ? 'Done' : 'Cancel'}
          </button>
          <button
            onClick={handleSend}
            disabled={!e164 || !body.trim() || busy || sent}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send text'}
          </button>
        </div>
      </div>
    </div>
  )
}

// US-centric normalization: strips punctuation, accepts 10-digit or
// 1-prefixed 11-digit numbers, or an already-E.164 string.
function normalizeE164(raw: string): string | null {
  const s = raw.trim()
  if (/^\+[1-9]\d{6,14}$/.test(s)) return s
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}
