import type {
  DealInput,
  DealRecord,
  PropertySnapshot,
  UnderwritingInput,
  UnderwritingOutput,
} from '@mfa/shared';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export async function fetchProperty(address: string): Promise<PropertySnapshot> {
  const url = new URL(`${BASE}/api/property`);
  url.searchParams.set('address', address);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchProviderStatus(): Promise<
  Record<string, { status: string; cost: string; required?: boolean }>
> {
  const res = await fetch(`${BASE}/api/providers/status`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function previewUnderwriting(u: UnderwritingInput): Promise<UnderwritingOutput> {
  const res = await fetch(`${BASE}/api/deals/underwrite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ underwriting: u }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function saveDeal(deal: DealInput): Promise<{ id: number; underwritingOutput: UnderwritingOutput }> {
  const res = await fetch(`${BASE}/api/deals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(deal),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchDeals(): Promise<DealRecord[]> {
  const res = await fetch(`${BASE}/api/deals`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchDeal(id: number): Promise<DealRecord> {
  const res = await fetch(`${BASE}/api/deals/${id}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
