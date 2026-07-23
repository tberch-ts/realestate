import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { landScripts, type ScriptContext } from '../lib/outreachScripts'

// Outreach scripts (SMS / call / mail) pre-filled with the lead's parcel
// details. Copy-to-clipboard per variant; "Log as outreach" is handled by
// the caller so this stays a dumb presenter.
export default function ScriptModal({
  ctx,
  onClose,
  onLogOutreach,
}: {
  ctx: ScriptContext
  onClose: () => void
  onLogOutreach?: () => Promise<void> | void
}) {
  const scripts = landScripts(ctx)
  const [logged, setLogged] = useState(false)

  async function handleLog() {
    if (!onLogOutreach || logged) return
    await onLogOutreach()
    setLogged(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Outreach scripts</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <ScriptBlock title="Text message" hint="≤ 320 chars · identifies you · includes opt-out" text={scripts.sms} />
        <ScriptBlock title="Call talk track" text={scripts.call} />
        <ScriptBlock title="Mail / letter" text={scripts.mail} />

        <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px] text-gray-600">
            Texting rules: one lead at a time, identify yourself, honor STOP, 8am–9pm recipient time only.
          </p>
          {onLogOutreach && (
            <button
              onClick={handleLog}
              disabled={logged}
              className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {logged ? 'Logged ✓' : 'Log as outreach'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ScriptBlock({ title, hint, text }: { title: string; hint?: string; text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">
          {title}
          {hint && <span className="ml-2 text-[11px] font-normal text-gray-500">{hint}</span>}
        </p>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="whitespace-pre-wrap rounded-lg border p-3 text-xs text-gray-300 font-sans"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}
      >
        {text}
      </pre>
    </div>
  )
}
