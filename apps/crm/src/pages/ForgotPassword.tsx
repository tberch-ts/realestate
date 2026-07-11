import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { Building2 } from 'lucide-react'
import { auth } from '../lib/firebase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)', color: '#f9fafb' }}>
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <Building2 size={20} className="text-blue-400" />
          <span className="font-bold tracking-tight text-lg">SmartInvestorCRM</span>
        </Link>

        <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h1 className="text-xl font-bold mb-1 text-center">Reset your password</h1>
          <p className="text-xs text-gray-500 text-center mb-6">
            Enter your email and we'll send a reset link.
          </p>

          {sent ? (
            <p className="text-sm text-emerald-400 text-center">
              Check your inbox for a reset link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: 'var(--border)' }}
              />
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                Send reset link
              </button>
            </form>
          )}

          <p className="text-center mt-4 text-xs text-gray-500">
            <Link to="/sign-in" className="hover:text-white transition-colors">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
