// Minimal typed wrapper for PostGrid Print & Mail API v1.
// Docs: https://postgrid.readme.io/  (we use /print-mail/v1/letters + /contacts)
// Auth: single x-api-key header. Test keys start with "test_sk_", live "live_sk_".
//
// Per-request mode: isDevMode() flips us to POSTGRID_API_KEY_TEST so the UI can
// browse prod with test credentials without changing env vars.

import { isDevMode } from '../middleware/devMode.js';

const BASE_URL = 'https://api.postgrid.com';

export interface PostGridAddress {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;
  postalOrZip: string;
  countryCode?: string; // default US
}

export interface CreateLetterInput {
  to: PostGridAddress;
  from: PostGridAddress;
  // Provide exactly one of html / pdfUrl / templateId
  html?: string;
  pdfUrl?: string;      // absolute URL PostGrid will fetch
  templateId?: string;
  color?: boolean;
  doubleSided?: boolean;
  addressPlacement?: 'top_first_page' | 'insert_blank_page';
  mailingClass?: 'first_class' | 'standard_class';
  description?: string; // shows in PostGrid dashboard; max 500 chars
  metadata?: Record<string, string>;
}

export interface PostGridLetterResponse {
  id: string;
  object: 'letter';
  live: boolean;
  status: string;            // ready, printing, in_transit, delivered, canceled, failed
  color: boolean;
  doubleSided: boolean;
  mailingClass: string;
  sendDate?: string;
  expectedDeliveryDate?: string;
  html?: string;
  attachedPDF?: string | null;
  carrierTracking?: {
    trackingNumber?: string;
    trackingUrl?: string;
    events?: unknown[];
  } | null;
  to: { id: string; addressStatus: string; [k: string]: unknown };
  from: { id: string; addressStatus: string; [k: string]: unknown };
  createdAt: string;
  updatedAt: string;
}

function apiKey(): string {
  const dev = isDevMode();
  const key = dev
    ? process.env.POSTGRID_API_KEY_TEST
    : process.env.POSTGRID_API_KEY;
  if (!key) throw new Error(`POSTGRID_API_KEY${dev ? '_TEST' : ''} not set`);
  return key;
}

export function currentMode(): 'test' | 'live' {
  return isDevMode() ? 'test' : 'live';
}

export async function createLetter(input: CreateLetterInput): Promise<PostGridLetterResponse> {
  const body: Record<string, unknown> = {
    to: { ...input.to, countryCode: input.to.countryCode ?? 'US' },
    from: { ...input.from, countryCode: input.from.countryCode ?? 'US' },
    color: input.color ?? false,
    doubleSided: input.doubleSided ?? false,
    mailingClass: input.mailingClass ?? 'first_class',
    addressPlacement: input.addressPlacement ?? 'top_first_page',
  };
  if (input.html)       body.html = input.html;
  if (input.pdfUrl)     body.pdf = input.pdfUrl;
  if (input.templateId) body.template = input.templateId;
  if (input.description) body.description = input.description.slice(0, 500);
  if (input.metadata)   body.metadata = input.metadata;

  const res = await fetch(`${BASE_URL}/print-mail/v1/letters`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`PostGrid createLetter ${res.status}: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(raw) as PostGridLetterResponse;
}

// Create a letter from a binary PDF buffer. Uses PostGrid's multipart/form-data
// path: 'pdf' field carries the file directly. addressPlacement defaults to
// 'insert_blank_page' since LOI PDFs typically already have their own letterhead
// — we don't want PostGrid stamping the address on top of the LOI's first page.
export async function createLetterFromPdfBuffer(
  input: Omit<CreateLetterInput, 'html' | 'pdfUrl' | 'templateId'> & { pdf: Buffer; pdfFilename?: string },
): Promise<PostGridLetterResponse> {
  const form = new FormData();
  const addr = (k: 'to' | 'from') => {
    const a = input[k];
    return { ...a, countryCode: a.countryCode ?? 'US' };
  };
  // PostGrid expects flattened to[firstName], from[city], etc. for multipart.
  for (const which of ['to', 'from'] as const) {
    const a = addr(which);
    for (const [k, v] of Object.entries(a)) {
      if (v !== undefined && v !== null) form.append(`${which}[${k}]`, String(v));
    }
  }
  form.append('color', String(input.color ?? false));
  form.append('doubleSided', String(input.doubleSided ?? false));
  form.append('mailingClass', input.mailingClass ?? 'first_class');
  form.append('addressPlacement', input.addressPlacement ?? 'insert_blank_page');
  if (input.description) form.append('description', input.description.slice(0, 500));
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) form.append(`metadata[${k}]`, v);
  }
  // Wrap the buffer as a Blob (Node 20 has both globally).
  const blob = new Blob([new Uint8Array(input.pdf)], { type: 'application/pdf' });
  form.append('pdf', blob, input.pdfFilename ?? 'letter.pdf');

  const res = await fetch(`${BASE_URL}/print-mail/v1/letters`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey() },  // do NOT set content-type — fetch sets it w/ boundary
    body: form,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`PostGrid createLetter (PDF) ${res.status}: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(raw) as PostGridLetterResponse;
}

export async function getLetter(letterId: string): Promise<PostGridLetterResponse> {
  const res = await fetch(`${BASE_URL}/print-mail/v1/letters/${encodeURIComponent(letterId)}`, {
    headers: { 'x-api-key': apiKey() },
  });
  if (!res.ok) throw new Error(`PostGrid getLetter ${res.status}`);
  return (await res.json()) as PostGridLetterResponse;
}

export async function cancelLetter(letterId: string): Promise<PostGridLetterResponse> {
  const res = await fetch(
    `${BASE_URL}/print-mail/v1/letters/${encodeURIComponent(letterId)}/cancellation`,
    { method: 'POST', headers: { 'x-api-key': apiKey() } },
  );
  if (!res.ok) throw new Error(`PostGrid cancelLetter ${res.status}`);
  return (await res.json()) as PostGridLetterResponse;
}

export function isConfigured(): boolean {
  // Either mode must be configured for the service to be "usable"; callers
  // decide which mode they need.
  return !!process.env.POSTGRID_API_KEY || !!process.env.POSTGRID_API_KEY_TEST;
}

export function liveConfigured(): boolean {
  return !!process.env.POSTGRID_API_KEY;
}

export function testConfigured(): boolean {
  return !!process.env.POSTGRID_API_KEY_TEST;
}
