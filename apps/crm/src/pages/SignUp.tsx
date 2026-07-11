import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Building2 } from 'lucide-react'
import { auth, db } from '../lib/firebase'
import { PLAN_TIERS } from '../types/plan'

const googleProvider = new GoogleAuthProvider()

async function createUserDoc(uid: string, email: string | null, planId: string) {
  await setDoc(doc(db, 'users', uid), {
    email,
    plan: planId in PLAN_TIERS ? planId : 'free',
    createdAt: serverTimestamp(),
  })
}

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const planId = searchParams.get('plan') ?? 'free'

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await createUserDoc(cred.user.uid, cred.user.email, planId)
      navigate('/app', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSignUp() {
    setError(null)
    setBusy(true)
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await createUserDoc(cred.user.uid, cred.user.email, planId)
      navigate('/app', { replace: true })
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
          <h1 className="text-xl font-bold mb-1 text-center">Create your account</h1>
          <p className="text-xs text-gray-500 text-center mb-6">
            {PLAN_TIERS[planId]?.name ?? 'Free'} plan
          </p>

          <button
            onClick={handleGoogleSignUp}
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

          <form onSubmit={handleEmailSignUp} className="space-y-3">
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
              minLength={6}
              placeholder="Password (min 6 characters)"
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
              Create account
            </button>
          </form>

          <p className="text-center mt-4 text-xs text-gray-500">
            Already have an account?{' '}
            <Link to="/sign-in" className="hover:text-white transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
