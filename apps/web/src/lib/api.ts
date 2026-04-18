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

import { API_URL as BASE } from './runtimeEnv';

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
  const url = new URL(`${BASE}/api/portfolio/denver/owners`, typeof window !== "undefined" ? window.location.origin : undefined);
  if (opts.outOfState) url.searchParams.set('outOfState', '1');
  if (opts.search) url.searchParams.set('search', opts.search);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data.clusters as OwnerCluster[];
}

export async function fetchOwner(name: string): Promise<OwnerCluster> {
  const url = new URL(`${BASE}/api/portfolio/denver/owner`, typeof window !== "undefined" ? window.location.origin : undefined);
  url.searchParams.set('name', name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data as OwnerCluster;
}

export async function fetchSosEntity(name: string): Promise<SosEntity | null> {
  const url = new URL(`${BASE}/api/sos/entity`, typeof window !== "undefined" ? window.location.origin : undefined);
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
  const url = new URL(`${BASE}/api/followup/denver`, typeof window !== "undefined" ? window.location.origin : undefined);
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
  const url = new URL(`${BASE}/api/property`, typeof window !== "undefined" ? window.location.origin : undefined);
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`filings list: ${res.status}`);
  return (await res.json()).data as FormDSummary[];
}

export async function getFormDFiling(accession: string, cik: string): Promise<FormDDetail> {
  const url = new URL(`${BASE}/api/filings/form-d/${encodeURIComponent(accession)}`, typeof window !== 'undefined' ? window.location.origin : undefined);
  url.searchParams.set('cik', cik);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`filing detail: ${res.status}`);
  return (await res.json()).data as FormDDetail;
}

// ---- CRM ----

export type ContactKind = 'person' | 'firm';
export type ContactSource = 'manual' | 'form_d' | 'portfolio' | 'owner' | 'loi';
export type ContactStatus = 'active' | 'archived';
export type InteractionKind = 'call' | 'email' | 'meeting' | 'note' | 'outreach_sent' | 'reply_received';
export type FollowUpStatus = 'open' | 'done' | 'skipped' | 'snoozed';

export interface Contact {
  id: number;
  kind: ContactKind;
  name: string;
  firmName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateCode?: string;
  zip?: string;
  notes?: string;
  source: ContactSource;
  sourceRef?: string;
  tags: string[];
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: number;
  contactId: number;
  occurredAt: string;
  kind: InteractionKind;
  subject?: string;
  body?: string;
  createdAt: string;
}

export interface FollowUp {
  id: number;
  contactId: number;
  dueDate: string;
  subject: string;
  notes?: string;
  status: FollowUpStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  contactName?: string;
}

export interface ContactDetail {
  contact: Contact;
  interactions: Interaction[];
  followUps: FollowUp[];
  properties: Array<{ contactId: number; propertyRef: string; relation: string; notes?: string }>;
  filings: Array<{ contactId: number; accessionNumber: string; cik?: string; relation: string; notes?: string }>;
}

export async function listContacts(opts: {
  status?: ContactStatus | 'all'; source?: ContactSource; search?: string; limit?: number;
} = {}): Promise<Contact[]> {
  const url = new URL(`${BASE}/api/crm/contacts`, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (opts.status) url.searchParams.set('status', opts.status);
  if (opts.source) url.searchParams.set('source', opts.source);
  if (opts.search) url.searchParams.set('search', opts.search);
  if (opts.limit)  url.searchParams.set('limit', String(opts.limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`list contacts: ${res.status}`);
  return (await res.json()).data as Contact[];
}

export async function getContact(id: number): Promise<ContactDetail> {
  const res = await fetch(`${BASE}/api/crm/contacts/${id}`);
  if (!res.ok) throw new Error(`get contact: ${res.status}`);
  return res.json();
}

export async function createContact(input: Partial<Contact> & { kind: ContactKind; name: string }): Promise<Contact> {
  const res = await fetch(`${BASE}/api/crm/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create contact: ${res.status}`);
  return res.json();
}

export async function patchContact(id: number, patch: Partial<Contact>): Promise<Contact> {
  const res = await fetch(`${BASE}/api/crm/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch contact: ${res.status}`);
  return res.json();
}

export async function deleteContact(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/crm/contacts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete contact: ${res.status}`);
}

export async function createInteraction(
  contactId: number,
  input: { kind: InteractionKind; subject?: string; body?: string; occurredAt?: string }
): Promise<Interaction> {
  const res = await fetch(`${BASE}/api/crm/contacts/${contactId}/interactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create interaction: ${res.status}`);
  return res.json();
}

export async function listFollowUps(opts: {
  status?: FollowUpStatus | 'all'; dueBefore?: string; limit?: number;
} = {}): Promise<FollowUp[]> {
  const url = new URL(`${BASE}/api/crm/follow-ups`, typeof window !== 'undefined' ? window.location.origin : undefined);
  if (opts.status)    url.searchParams.set('status', opts.status);
  if (opts.dueBefore) url.searchParams.set('dueBefore', opts.dueBefore);
  if (opts.limit)     url.searchParams.set('limit', String(opts.limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`list follow-ups: ${res.status}`);
  return (await res.json()).data as FollowUp[];
}

export async function createFollowUp(
  contactId: number,
  input: { dueDate: string; subject: string; notes?: string }
): Promise<FollowUp> {
  const res = await fetch(`${BASE}/api/crm/contacts/${contactId}/follow-ups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create follow-up: ${res.status}`);
  return res.json();
}

export async function patchFollowUp(id: number, patch: Partial<FollowUp>): Promise<FollowUp> {
  const res = await fetch(`${BASE}/api/crm/follow-ups/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch follow-up: ${res.status}`);
  return res.json();
}

export async function importContactsFromFormD(accession: string, cik: string): Promise<{
  created: Array<{ contactId: number; name: string; relation: string; portfolioMatches: number }>;
}> {
  const res = await fetch(`${BASE}/api/crm/contacts/from-form-d`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accession, cik }),
  });
  if (!res.ok) throw new Error(`import form-d: ${res.status}`);
  return res.json();
}

export async function matchContactToPortfolio(id: number): Promise<{
  contactId: number;
  matches: number;
  details: Array<{ propertyRef: string; ownerName: string; score: number; units: number; address: string }>;
}> {
  const res = await fetch(`${BASE}/api/crm/contacts/${id}/match-portfolio`, { method: 'POST' });
  if (!res.ok) throw new Error(`match-portfolio: ${res.status}`);
  return res.json();
}

export async function matchAllToPortfolio(): Promise<{
  firmsScanned: number;
  totalLinks: number;
  perContact: Array<{ id: number; name: string; matches: number }>;
}> {
  const res = await fetch(`${BASE}/api/crm/match-portfolio-all`, { method: 'POST' });
  if (!res.ok) throw new Error(`match-portfolio-all: ${res.status}`);
  return res.json();
}
