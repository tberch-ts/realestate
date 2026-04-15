import type { PropertySnapshot } from '@mfa/shared';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export async function fetchProperty(address: string): Promise<PropertySnapshot> {
  const url = new URL(`${BASE}/api/property`);
  url.searchParams.set('address', address);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchProviderStatus(): Promise<Record<string, { status: string; cost: string; required?: boolean }>> {
  const res = await fetch(`${BASE}/api/providers/status`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
