import type {
  DealInput,
  DealRecord,
  FollowupResult,
  LoiDraft,
  LoiDraftCreate,
  LoiDraftPatch,
  LoiInput,
  OwnerCluster,
  PropertySnapshot,
  SosEntity,
  UnderwritingInput,
  UnderwritingOutput,
} from '@mfa/shared';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// ---- LOI drafts ----

export async function createDraft(input: LoiDraftCreate): Promise<LoiDraft> {
  const res = await fetch(`${BASE}/api/loi/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create draft: ${res.status}`);
  return res.json();
}

export async function updateDraft(id: number, patch: LoiDraftPatch): Promise<LoiDraft> {
  const res = await fetch(`${BASE}/api/loi/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update draft: ${res.status}`);
  return res.json();
}

export async function loadDraft(id: number): Promise<LoiDraft> {
  const res = await fetch(`${BASE}/api/loi/drafts/${id}`);
  if (!res.ok) throw new Error(`load draft: ${res.status}`);
  return res.json();
}

export async function listDrafts(status: 'draft' | 'sent' | 'archived' | 'all' = 'draft'): Promise<LoiDraft[]> {
  const res = await fetch(`${BASE}/api/loi/drafts?status=${status}`);
  if (!res.ok) throw new Error(`list drafts: ${res.status}`);
  const body = await res.json();
  return body.data as LoiDraft[];
}

export async function deleteDraft(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/loi/drafts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete draft: ${res.status}`);
}

// ---- Portfolio (city-wide ownership) ----

export async function fetchOwners(opts: {
  outOfState?: boolean;
  search?: string;
  limit?: number;
} = {}): Promise<OwnerCluster[]> {
  const url = new URL(`${BASE}/api/portfolio/denver/owners`);
  if (opts.outOfState) url.searchParams.set('outOfState', '1');
  if (opts.search) url.searchParams.set('search', opts.search);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data.clusters as OwnerCluster[];
}

export async function fetchOwner(name: string): Promise<OwnerCluster> {
  const url = new URL(`${BASE}/api/portfolio/denver/owner`);
  url.searchParams.set('name', name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data as OwnerCluster;
}

export async function fetchSosEntity(name: string): Promise<SosEntity | null> {
  const url = new URL(`${BASE}/api/sos/entity`);
  url.searchParams.set('name', name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data as SosEntity | null;
}

// ---- Follow-up ----

export async function fetchFollowup(
  zone: string,
  opts: { minUnits?: number; minYear?: number; limit?: number } = {}
): Promise<FollowupResult> {
  const url = new URL(`${BASE}/api/followup/denver`);
  url.searchParams.set('zone', zone);
  if (opts.minUnits) url.searchParams.set('minUnits', String(opts.minUnits));
  if (opts.minYear) url.searchParams.set('minYear', String(opts.minYear));
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 120)}`);
  }
  const body = await res.json();
  return body.data as FollowupResult;
}

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

export async function downloadLoi(deal: DealInput, loi: LoiInput): Promise<void> {
  const res = await fetch(`${BASE}/api/loi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deal, loi }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LOI ${res.status}: ${text}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? 'LOI.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
