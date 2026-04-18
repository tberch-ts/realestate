import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SEC EDGAR Form D (Regulation D exempt offerings). Free, no key.
// Rate limit: 10 req/sec per IP. SEC requires an identifying User-Agent header.
//
// Two calls:
//   1. search-index (efts.sec.gov) — list summary of Form D filings by date/keyword
//   2. primary_doc.xml — full structured data for a single filing (issuer, offering, persons)

const UA = 'MultifamilyAnalyzer tberch@gmail.com';
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;   // 6h for listing pages
const DETAIL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d — filings are immutable once posted

function sanitizeAccession(acc: string): string {
  // "0000945621-25-001267" -> "0000945621-25-001267" (leave dashes for URLs;
  // strip dashes only when building the Archives path)
  return acc.replace(/[^0-9-]/g, '');
}

export interface FormDSummary {
  accessionNumber: string;   // e.g. 0000945621-25-001267
  cik: string;                // zero-padded
  filingDate: string;         // YYYY-MM-DD
  form: string;               // "D" or "D/A"
  issuerName: string;
  issuerState?: string;       // from biz_states
  issuerLocation?: string;    // from biz_locations (e.g. "Denver, CO")
  incState?: string;
}

export interface FormDDetail extends FormDSummary {
  issuerAddress?: {
    street1?: string; street2?: string; city?: string; state?: string; zip?: string;
  };
  issuerPhone?: string;
  entityType?: string;
  jurisdictionOfInc?: string;
  yearOfInc?: string;
  industryGroupType?: string;   // e.g. "Real Estate", "Pooled Investment Fund"
  totalOfferingAmount?: string; // may be "Indefinite" or a number string
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

// ---- cache helpers ----
async function readJson<T>(file: string, ttl: number): Promise<T | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, file), 'utf8');
    const cached = JSON.parse(raw);
    if (cached && typeof cached.ts === 'number' && Date.now() - cached.ts < ttl) return cached.data as T;
  } catch {}
  return null;
}
async function writeJson(file: string, data: unknown): Promise<void> {
  try { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(join(CACHE_DIR, file), JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ---- search ----
interface EdgarSearchHit {
  _id: string;   // "{accession}:{filename}"
  _source: {
    ciks?: string[];
    display_names?: string[];
    file_date?: string;
    biz_states?: string[];
    biz_locations?: string[];
    form?: string;
    adsh?: string;
    inc_states?: string[];
  };
}
interface EdgarSearchResponse {
  hits: { hits: EdgarSearchHit[]; total?: { value: number } };
}

function stripDisplayName(s: string): string {
  return s.replace(/\s*\(CIK\s+[^)]+\)\s*$/i, '').trim();
}

export interface SearchFormDOpts {
  state?: string;              // 2-letter, filters biz_states client-side
  dateFrom?: string;           // YYYY-MM-DD
  dateTo?: string;
  keyword?: string;            // EDGAR q= (phrase)
  limit?: number;              // cap returned (after state filter)
}

export async function searchFormD(opts: SearchFormDOpts = {}): Promise<FormDSummary[]> {
  const {
    state,
    dateFrom = oneYearAgo(),
    dateTo = today(),
    keyword = '"real estate"',
    limit = 100,
  } = opts;

  const cacheKey = `edgar_search_${state ?? 'ALL'}_${dateFrom}_${dateTo}_${Buffer.from(keyword).toString('base64').slice(0, 16)}.json`;
  const cached = await readJson<FormDSummary[]>(cacheKey, SEARCH_TTL_MS);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: keyword,
    forms: 'D',
    dateRange: 'custom',
    startdt: dateFrom,
    enddt: dateTo,
  });
  const url = `https://efts.sec.gov/LATEST/search-index?${params}`;

  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`EDGAR search HTTP ${res.status}`);
  const body = (await res.json()) as EdgarSearchResponse;
  const hits = body.hits?.hits ?? [];

  const summaries: FormDSummary[] = hits
    .map((h) => {
      const s = h._source;
      return {
        accessionNumber: s.adsh ?? '',
        cik: (s.ciks?.[0] ?? '').padStart(10, '0'),
        filingDate: s.file_date ?? '',
        form: s.form ?? 'D',
        issuerName: stripDisplayName(s.display_names?.[0] ?? ''),
        issuerState: s.biz_states?.[0],
        issuerLocation: s.biz_locations?.[0],
        incState: s.inc_states?.[0],
      };
    })
    .filter((s) => s.accessionNumber);

  const filtered = state
    ? summaries.filter((s) => s.issuerState === state.toUpperCase())
    : summaries;

  const trimmed = filtered.slice(0, limit);
  await writeJson(cacheKey, trimmed);
  return trimmed;
}

// ---- detail (primary_doc.xml) ----
function xmlText(xml: string, tag: string, after?: number): { value: string; end: number } | null {
  const re = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'g');
  if (after !== undefined) re.lastIndex = after;
  const m = re.exec(xml);
  if (!m) return null;
  return { value: m[1].trim(), end: re.lastIndex };
}
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}
function xmlBlock(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function parseRelatedPersons(xml: string): FormDDetail['relatedPersons'] {
  const listBlock = xmlBlock(xml, 'relatedPersonsList')[0];
  if (!listBlock) return undefined;
  const persons: NonNullable<FormDDetail['relatedPersons']> = [];
  for (const personXml of xmlBlock(listBlock, 'relatedPersonInfo')) {
    const first = xmlText(personXml, 'firstName')?.value ?? '';
    const middle = xmlText(personXml, 'middleName')?.value ?? '';
    const last = xmlText(personXml, 'lastName')?.value ?? '';
    const name = [first, middle, last].filter((s) => s && s.toLowerCase() !== 'n/a').join(' ').trim();
    const relationships = xmlAll(personXml, 'relationship');
    const clarification = xmlText(personXml, 'relationshipClarification')?.value;
    const city = xmlText(personXml, 'city')?.value;
    const state = xmlText(personXml, 'stateOrCountry')?.value;
    const zip = xmlText(personXml, 'zipCode')?.value;
    persons.push({
      name: name || '(unknown)',
      relationship: relationships,
      clarification: clarification || undefined,
      address: (city || state || zip) ? { city, state, zip } : undefined,
    });
  }
  return persons;
}

export async function getFormDDetail(accessionNumber: string, cik: string): Promise<FormDDetail | null> {
  const acc = sanitizeAccession(accessionNumber);
  const cikInt = Number(cik).toString(); // strip leading zeros for path
  const accNoDash = acc.replace(/-/g, '');

  const cacheKey = `edgar_detail_${acc}.json`;
  const cached = await readJson<FormDDetail>(cacheKey, DETAIL_TTL_MS);
  if (cached) return cached;

  const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/primary_doc.xml`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/xml' } });
  if (!res.ok) return null;
  const xml = await res.text();

  const issuerBlock = xmlBlock(xml, 'primaryIssuer')[0] ?? '';
  const issuerAddressBlock = xmlBlock(issuerBlock, 'issuerAddress')[0] ?? '';
  const offeringBlock = xmlBlock(xml, 'offeringData')[0] ?? '';

  const num = (s?: string) => {
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (s?: string) => (s === 'true' ? true : s === 'false' ? false : undefined);

  const detail: FormDDetail = {
    accessionNumber: acc,
    cik: cik.padStart(10, '0'),
    form: xmlText(xml, 'submissionType')?.value ?? 'D',
    filingDate: '', // fill from search summary if needed
    issuerName: xmlText(issuerBlock, 'entityName')?.value ?? '',
    entityType: xmlText(issuerBlock, 'entityType')?.value,
    jurisdictionOfInc: xmlText(issuerBlock, 'jurisdictionOfInc')?.value,
    yearOfInc: xmlText(issuerBlock, 'value')?.value,
    issuerPhone: xmlText(issuerBlock, 'issuerPhoneNumber')?.value,
    issuerAddress: {
      street1: xmlText(issuerAddressBlock, 'street1')?.value,
      street2: xmlText(issuerAddressBlock, 'street2')?.value,
      city: xmlText(issuerAddressBlock, 'city')?.value,
      state: xmlText(issuerAddressBlock, 'stateOrCountry')?.value,
      zip: xmlText(issuerAddressBlock, 'zipCode')?.value,
    },
    issuerState: xmlText(issuerAddressBlock, 'stateOrCountry')?.value,
    industryGroupType: xmlText(offeringBlock, 'industryGroupType')?.value,
    totalOfferingAmount: xmlText(offeringBlock, 'totalOfferingAmount')?.value,
    totalAmountSold: num(xmlText(offeringBlock, 'totalAmountSold')?.value),
    totalRemaining: xmlText(offeringBlock, 'totalRemaining')?.value,
    minimumInvestment: num(xmlText(offeringBlock, 'minimumInvestmentAccepted')?.value),
    investorCount: num(xmlText(offeringBlock, 'totalNumberAlreadyInvested')?.value),
    hasNonAccreditedInvestors: bool(xmlText(offeringBlock, 'hasNonAccreditedInvestors')?.value),
    dateOfFirstSale: xmlText(offeringBlock, 'dateOfFirstSale')?.value,
    relatedPersons: parseRelatedPersons(xml),
  };

  await writeJson(cacheKey, detail);
  return detail;
}

// ---- helpers ----
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function oneYearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
