import type {
  DealInput, FollowupResult, LoiInput, OwnerCluster, PropertySnapshot, SosEntity,
} from '@mfa/shared';
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

// ---- Billing (Stripe) ----

export async function createCheckoutSession(plan: 'pro' | 'team'): Promise<{ url: string }> {
  const res = await apiFetch(`${BASE}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API ${res.status}`);
  }
  return res.json();
}

export async function createPortalSession(): Promise<{ url: string }> {
  const res = await apiFetch(`${BASE}/api/billing/portal`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API ${res.status}`);
  }
  return res.json();
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

// ---- Portfolio (city-wide ownership) ----

export async function fetchOwners(opts: {
  outOfState?: boolean;
  search?: string;
  limit?: number;
} = {}): Promise<OwnerCluster[]> {
  const url = new URL(`${BASE}/api/portfolio/denver/owners`, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (opts.outOfState) url.searchParams.set('outOfState', '1');
  if (opts.search) url.searchParams.set('search', opts.search);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data.clusters as OwnerCluster[];
}

export async function fetchOwner(name: string): Promise<OwnerCluster> {
  const url = new URL(`${BASE}/api/portfolio/denver/owner`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('name', name);
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data as OwnerCluster;
}

export async function fetchSosEntity(name: string): Promise<SosEntity | null> {
  const url = new URL(`${BASE}/api/sos/entity`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('name', name);
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data as SosEntity | null;
}

// ---- Follow-up ----

export async function fetchFollowup(
  zone: string,
  opts: { minUnits?: number; minYear?: number; limit?: number } = {}
): Promise<FollowupResult> {
  const url = new URL(`${BASE}/api/followup/denver`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('zone', zone);
  if (opts.minUnits) url.searchParams.set('minUnits', String(opts.minUnits));
  if (opts.minYear) url.searchParams.set('minYear', String(opts.minYear));
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  const res = await apiFetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 120)}`);
  }
  const body = await res.json();
  return body.data as FollowupResult;
}

// ---- SEC EDGAR Form D ----

export interface FormDSummary {
  accessionNumber: string;
  cik: string;
  filingDate: string;
  form: string;
  issuerName: string;
  issuerState?: string;
  issuerLocation?: string;
  incState?: string;
}

export interface FormDDetail extends FormDSummary {
  issuerAddress?: { street1?: string; street2?: string; city?: string; state?: string; zip?: string };
  issuerPhone?: string;
  entityType?: string;
  jurisdictionOfInc?: string;
  industryGroupType?: string;
  totalOfferingAmount?: string;
  totalAmountSold?: number;
  totalRemaining?: string;
  minimumInvestment?: number;
  investorCount?: number;
  hasNonAccreditedInvestors?: boolean;
  dateOfFirstSale?: string;
  relatedPersons?: Array<{
    name: string;
    relationship: string[];
    clarification?: string;
    address?: { city?: string; state?: string; zip?: string };
  }>;
}

export async function listFormDFilings(opts: {
  state?: string; keyword?: string; dateFrom?: string; dateTo?: string; limit?: number;
} = {}): Promise<FormDSummary[]> {
  const url = new URL(`${BASE}/api/filings/form-d`, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (opts.state)    url.searchParams.set('state', opts.state);
  if (opts.keyword)  url.searchParams.set('keyword', opts.keyword);
  if (opts.dateFrom) url.searchParams.set('dateFrom', opts.dateFrom);
  if (opts.dateTo)   url.searchParams.set('dateTo', opts.dateTo);
  if (opts.limit)    url.searchParams.set('limit', String(opts.limit));
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`filings list: ${res.status}`);
  return (await res.json()).data as FormDSummary[];
}

export async function getFormDFiling(accession: string, cik: string): Promise<FormDDetail> {
  const url = new URL(`${BASE}/api/filings/form-d/${encodeURIComponent(accession)}`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('cik', cik);
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`filing detail: ${res.status}`);
  return (await res.json()).data as FormDDetail;
}

// ---- Market Intel ----

export interface MarketCompareRow {
  name: string;
  state: string;
  population?: number;
  medianIncome?: number;
  medianRent?: number;
  rentBurdenedPct?: number;
  rentToIncomeRatio?: number;
  violentCrimeRate?: number;
  crimeYear?: number;
  crimeJurisdiction?: string;
  landlordScore: number;
  landlordTier: 'friendly' | 'moderate' | 'unfriendly';
  landlordNotes?: string;
  similarityToDenver?: number;
  investability?: number;
  errors?: string[];
}

export async function fetchMarketsCompare(opts: { force?: boolean } = {}): Promise<MarketCompareRow[]> {
  const url = new URL(`${BASE}/api/markets/compare`, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (opts.force) url.searchParams.set('force', '1');
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`markets compare: ${res.status}`);
  return (await res.json()).data.markets as MarketCompareRow[];
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
