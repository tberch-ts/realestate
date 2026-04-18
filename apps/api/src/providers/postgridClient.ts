// Minimal typed wrapper for PostGrid Print & Mail API v1.
// Docs: https://postgrid.readme.io/  (we use /print-mail/v1/letters + /contacts)
// Auth: single x-api-key header. Test keys start with "test_sk_", live "live_sk_".

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
  const key = process.env.POSTGRID_API_KEY;
  if (!key) throw new Error('POSTGRID_API_KEY not set');
  return key;
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
  return !!process.env.POSTGRID_API_KEY;
}
