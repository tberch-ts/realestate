import type { DealInput, LoiInput, PropertySnapshot } from '@mfa/shared';
import { API_URL as BASE } from './runtimeEnv';
import { auth } from './firebase';

export interface PostGridAddress {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;
  postalOrZip: string;
  countryCode?: string;
}

// Centralized fetch for all /api/* calls from apps/crm — resolves relative
// paths against API_URL and attaches the signed-in user's Firebase ID token,
// mirroring apps/web's src/lib/api.ts apiFetch convention.
export async function apiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const user = auth.currentUser;
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return fetch(input, { ...init, headers });
}

export async function fetchProperty(address: string): Promise<PropertySnapshot> {
  const url = new URL(`${BASE}/api/property`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('address', address);
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function downloadLoiPdf(deal: DealInput, loi: LoiInput): Promise<Blob> {
  const res = await apiFetch(`${BASE}/api/loi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deal, loi }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.blob();
}

export async function sendPostgridLetter(input: {
  to: PostGridAddress;
  from: PostGridAddress;
  deal?: DealInput;
  loi?: LoiInput;
  html?: string;
  subject?: string;
}): Promise<{ id: string; status: string; live: boolean }> {
  const res = await apiFetch(`${BASE}/api/postgrid/letters/inline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API ${res.status}`);
  }
  return res.json();
}
