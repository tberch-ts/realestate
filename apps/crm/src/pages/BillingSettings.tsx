import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { API_URL } from '../lib/runtimeEnv';
import { PricingGrid } from './Landing';

interface BillingStatus {
  plan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
}

interface ConnectStatus {
  hasAccount: boolean;
  accountId?: string;
  capabilityStatus: string;
}

const card = { background: 'var(--bg-card)', borderColor: 'var(--border)' };
const BTN = 'px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export default function BillingSettings() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [billingRes, connectRes] = await Promise.all([
      apiFetch(`${API_URL}/api/billing/status`),
      apiFetch(`${API_URL}/api/connect/status`),
    ]);
    if (billingRes.ok) setBilling(await billingRes.json());
    if (connectRes.ok) setConnect(await connectRes.json());
  }

  useEffect(() => {
    refresh().catch((err) => setError((err as Error).message));
  }, []);

  async function handleUpgrade(planId: string) {
    setBusy(`plan:${planId}`);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/api/billing/checkout-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? body?.error ?? `API ${res.status}`);
      window.location.href = body.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function handleManageBilling() {
    setBusy('portal');
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/api/billing/portal-session`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `API ${res.status}`);
      window.location.href = body.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function handleConnectOnboarding() {
    setBusy('connect');
    setError(null);
    try {
      if (!connect?.hasAccount) {
        const createRes = await apiFetch(`${API_URL}/api/connect/account`, { method: 'POST' });
        const createBody = await createRes.json();
        if (!createRes.ok) throw new Error(createBody?.error ?? `API ${createRes.status}`);
      }
      const linkRes = await apiFetch(`${API_URL}/api/connect/onboarding-link`, { method: 'POST' });
      const linkBody = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkBody?.error ?? `API ${linkRes.status}`);
      window.location.href = linkBody.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4 max-w-xl">
          {error}
        </div>
      )}

      <section className="mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Your SmartInvestorCRM plan
        </h2>
        {billing?.currentPeriodEnd && (
          <p className="text-xs text-gray-500 mb-3">
            Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
        <PricingGrid currentPlan={billing?.plan} onUpgrade={handleUpgrade} />
        {billing?.hasStripeCustomer && (
          <button className="mt-4 text-sm text-blue-400 hover:underline disabled:opacity-50" disabled={busy === 'portal'} onClick={handleManageBilling}>
            {busy === 'portal' ? 'Opening…' : 'Manage billing & payment method →'}
          </button>
        )}
      </section>

      <section className="rounded-xl border p-5 max-w-xl" style={card}>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Accept your own payments (Stripe Connect)
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Collect earnest money, application fees, or rent directly from your contacts. You're the
          merchant of record — SmartInvestorCRM never touches the money.
        </p>
        <dl className="text-sm space-y-2 mb-4">
          <div className="flex justify-between">
            <dt className="text-gray-500">Status</dt>
            <dd>
              {connect?.capabilityStatus === 'active'
                ? 'Active — ready to accept payments'
                : connect?.capabilityStatus === 'pending'
                  ? 'Pending Stripe review'
                  : connect?.capabilityStatus === 'restricted'
                    ? 'Restricted — action needed'
                    : 'Not connected'}
            </dd>
          </div>
        </dl>
        <button className={BTN} disabled={busy === 'connect'} onClick={handleConnectOnboarding}>
          {busy === 'connect' ? 'Redirecting…' : connect?.hasAccount ? 'Continue onboarding' : 'Connect Stripe account'}
        </button>
      </section>
    </div>
  );
}
