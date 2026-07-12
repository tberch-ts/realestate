import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { createCheckoutSession, createPortalSession } from '../lib/api'
import type { UserProfile } from '../lib/collections'
import { PLAN_TIERS } from '../types/plan'
import { PricingGrid } from './Landing'

export default function Billing() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const checkoutResult = params.get('checkout')

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => setProfile(snap.data() as UserProfile | undefined ?? null))
  }, [user])

  async function handleUpgrade(planId: string) {
    setError(null)
    setBusy(planId)
    try {
      const { url } = await createCheckoutSession(planId as 'pro' | 'team')
      window.location.href = url
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  async function handleManageBilling() {
    setError(null)
    setBusy('portal')
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  const plan = profile?.plan ?? 'free'
  const isPaid = plan !== 'free'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Billing</h1>
      <p className="text-sm text-gray-500 mb-6">Manage your plan and payment method.</p>

      {checkoutResult === 'success' && (
        <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm mb-6">
          Payment received — your plan updates automatically within a few seconds. Refresh if it doesn't update right away.
        </div>
      )}
      {checkoutResult === 'cancelled' && (
        <div className="p-3 rounded-lg border text-gray-400 text-sm mb-6" style={{ borderColor: 'var(--border)' }}>
          Checkout was cancelled — you're still on the {PLAN_TIERS[plan]?.name ?? 'Free'} plan.
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm mb-6">{error}</div>
      )}

      <div className="rounded-xl border p-5 mb-8" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Current plan</p>
            <p className="text-xl font-bold" style={{ color: PLAN_TIERS[plan]?.color }}>{PLAN_TIERS[plan]?.name ?? 'Free'}</p>
            {profile?.planStatus && profile.planStatus !== 'active' && (
              <p className="text-xs text-amber-300 mt-1">Status: {profile.planStatus}</p>
            )}
          </div>
          {isPaid && (
            <button
              onClick={handleManageBilling}
              disabled={busy === 'portal'}
              className="px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-white/5 transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border)' }}
            >
              {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </button>
          )}
        </div>
      </div>

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Plans</h2>
      <PricingGrid currentPlan={plan} onUpgrade={handleUpgrade} />
    </div>
  )
}
