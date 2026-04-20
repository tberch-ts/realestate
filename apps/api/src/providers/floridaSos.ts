import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderResult, SosEntity } from '@mfa/shared';

// Florida Division of Corporations "Sunbiz" — public business entity
// search. Free, no API key, scrape-friendly (no JS required, no
// captcha on list/detail pages). Covers Tampa MSA + all of FL.
//
// Flow mirrors coloradoSos.ts:
//   1. GET the search form page (picks up session cookies)
//   2. GET the inquiry URL with the name embedded (Sunbiz supports
//      both GET and POST; GET is simpler and returns the list page)
//   3. GET the first entity detail link
//   4. Parse out the labeled fields

const SEARCH_URL =
  'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults';
const BASE = 'https://search.sunbiz.org';

const CACHE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.cache/florida_sos_entities.json'
);
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheShape = Record<string, { ts: number; entity: SosEntity | null }>;
let memCache: CacheShape | null = null;

export async function fetchFloridaSosEntity(
  name: string
): Promise<ProviderResult<SosEntity | null>> {
  const provider = 'florida_sos';
  const key = name.trim().toUpperCase();
  if (!key) return { provider, status: 'error', message: 'name required' };

  if (!memCache) await loadDiskCache();
  const hit = memCache?.[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { provider, status: 'ok', data: hit.entity, fetchedAt: new Date(hit.ts).toISOString() };
  }

  try {
    const entity = await scrape(name);
    memCache = { ...(memCache ?? {}), [key]: { ts: Date.now(), entity } };
    void saveDiskCache();
    return { provider, status: 'ok', data: entity, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

async function scrape(name: string): Promise<SosEntity | null> {
  // 1. Sunbiz takes search params on a GET; `inquirytype=EntityName` is
  //    the entity-name search, `searchNameOrder` is the normalized key.
  const params = new URLSearchParams({
    inquirytype: 'EntityName',
    directionType: 'Initial',
    searchNameOrder: name.trim().toUpperCase(),
    aggregateId: '',
    searchTerm: name.trim(),
    listNameOrder: '',
  });
  const listUrl = `${SEARCH_URL}?${params.toString()}`;
  const listRes = await fetch(listUrl, { headers: { 'user-agent': USER_AGENT } });
  const setCookie = listRes.headers.get('set-cookie') ?? '';
  const listHtml = await listRes.text();

  // Sunbiz links: /Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=...
  const linkMatch = listHtml.match(/\/Inquiry\/CorporationSearch\/SearchResultDetail[^"']+/);
  if (!linkMatch) return null;
  const detailUrl = `${BASE}${linkMatch[0].replace(/&amp;/g, '&')}`;

  // 2. Detail page
  const detailRes = await fetch(detailUrl, {
    headers: { 'user-agent': USER_AGENT, cookie: setCookie },
  });
  const detailHtml = await detailRes.text();

  return parseDetail(detailHtml, detailUrl);
}

function parseDetail(html: string, detailUrl: string): SosEntity | null {
  // Sunbiz wraps fields in <label>...</label><span>VALUE</span>-ish blocks.
  // Strip tags and then pull labeled sections. Label names on Sunbiz:
  //   "Filing Information" block: Document Number, FEI/EIN Number,
  //     Date Filed, Effective Date, State, Status, Last Event
  //   "Principal Address" block
  //   "Mailing Address" block
  //   "Registered Agent Name & Address" block
  //   Name header is in an <h1> at the top.
  const plain = html
    .replace(/\s+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  // Entity name — appears right after "Detail by Entity Name" heading.
  const nameMatch = plain.match(/Detail by Entity Name\s+(.*?)\s+Filing Information/i);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  const between = (start: RegExp, end: RegExp): string | undefined => {
    const sMatch = plain.match(start);
    if (!sMatch) return undefined;
    const s = (sMatch.index ?? 0) + sMatch[0].length;
    const rest = plain.slice(s);
    const eMatch = rest.match(end);
    if (!eMatch) return undefined;
    return rest.slice(0, eMatch.index).trim() || undefined;
  };

  const documentNumber = between(/Document Number\s+/i, /FEI\/EIN Number|Date Filed/i);
  const dateFiled = between(/Date Filed\s+/i, /Effective Date|State|Status/i);
  const status = between(/Status\s+/i, /Last Event|Principal Address/i);
  const principalAddress = between(/Principal Address\s+/i, /Changed:|Mailing Address/i);

  // Registered agent: name then address.
  const raBlockMatch = plain.match(/Registered Agent Name & Address([^]*?)Officer\/Director Detail|Annual Reports/i);
  let registeredAgentName: string | undefined;
  let registeredAgentAddress: string | undefined;
  if (raBlockMatch) {
    const ra = raBlockMatch[1];
    // Name is typically the first non-empty line; address is everything
    // until the next recognizable label. Best-effort parse.
    const raLines = ra.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    registeredAgentName = raLines[0];
    registeredAgentAddress = raLines.slice(1, 4).join(', ');
  }

  return {
    entityName: name,
    sosId: documentNumber,
    status,
    formedDate: normalizeDate(dateFiled),
    registeredAgent:
      registeredAgentName || registeredAgentAddress
        ? { name: registeredAgentName, address: registeredAgentAddress }
        : undefined,
    principalAddress,
    profileUrl: detailUrl,
  };
}

function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Sunbiz uses "MM/DD/YYYY"
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

async function loadDiskCache(): Promise<void> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    memCache = JSON.parse(raw) as CacheShape;
  } catch {
    memCache = {};
  }
}

async function saveDiskCache(): Promise<void> {
  if (!memCache) return;
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(memCache));
  } catch (e) {
    console.warn('[florida-sos] cache save failed:', (e as Error).message);
  }
}

const USER_AGENT = 'MultiFamilyAnalyzer/0.1 (+https://github.com/TalkStudioLLC)';
