import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { Building2 } from 'lucide-react'
import { auth } from '../lib/firebase'

const googleProvider = new GoogleAuthProvider()

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setBusy(true)
    try {
      await signInWithPopup(auth, googleProvider)
      navigate(from, { replace: true })
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
          <h1 className="text-xl font-bold mb-6 text-center">Sign in</h1>

          <button
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="w-full py-2.5 rounded-lg border text-sm font-medium hover:bg-white/5 transition-colors mb-4 disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4 text-xs text-gray-600">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            or
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: 'var(--border)' }}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: 'var(--border)' }}
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              Sign in
            </button>
          </form>

          <div className="flex justify-between mt-4 text-xs text-gray-500">
            <Link to="/forgot-password" className="hover:text-white transition-colors">Forgot password?</Link>
            <Link to="/sign-up" className="hover:text-white transition-colors">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
