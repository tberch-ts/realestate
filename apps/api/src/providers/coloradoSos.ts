import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderResult, SosEntity } from '@mfa/shared';

// Colorado Secretary of State — public business-entity search.
// Flow: GET search page (cookies + docWorkThruDt) -> POST search -> GET detail page.
// All free. No API key. Cached aggressively since entity records rarely change.

const SEARCH_URL = 'https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do';
const BASE = 'https://www.sos.state.co.us';

const CACHE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.cache/sos_entities.json'
);
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheShape = Record<string, { ts: number; entity: SosEntity | null }>;
let memCache: CacheShape | null = null;

export async function fetchSosEntity(name: string): Promise<ProviderResult<SosEntity | null>> {
  const provider = 'colorado_sos';
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
  // 1. GET search page to pick up session cookies + docWorkThruDt token.
  const pageRes = await fetch(SEARCH_URL, {
    headers: { 'user-agent': USER_AGENT },
  });
  const setCookie = pageRes.headers.get('set-cookie') ?? '';
  const pageHtml = await pageRes.text();
  const docDt = pageHtml.match(/name="docWorkThruDt"\s+value="([^"]+)"/i)?.[1] ?? '';

  // 2. POST search.
  const body = new URLSearchParams({
    docWorkThruDt: docDt,
    searchName: name,
    mstrTmkId: '',
    resetTransTyp: 'true',
    cmd: 'Search',
  }).toString();
  const searchRes = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
      cookie: setCookie,
      referer: SEARCH_URL,
    },
    body,
    redirect: 'follow',
  });
  const resultsHtml = await searchRes.text();

  // Extract first detail link (SOS returns multiple on partial matches; take best).
  const linkMatch = resultsHtml.match(/BusinessEntityDetail\.do[^"'>]+/);
  if (!linkMatch) return null;
  const detailPath = linkMatch[0].replace(/&amp;/g, '&');
  const detailUrl = `${BASE}/biz/${detailPath}`;

  // 3. GET detail page.
  const detailRes = await fetch(detailUrl, {
    headers: { 'user-agent': USER_AGENT, cookie: setCookie },
  });
  const detailHtml = await detailRes.text();

  return parseDetail(detailHtml, detailUrl);
}

function parseDetail(html: string, detailUrl: string): SosEntity | null {
  const plain = html
    .replace(/\s+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  // Labels appear in predictable order; grab the value between each label and the next one.
  // Order seen in a live fetch: Name, Status, Formation date, ID number, Form, Periodic report month, Jurisdiction,
  //   Principal office street address, Principal office mailing address, Registered Agent Name, Street address, Mailing address.
  const between = (start: string, end: string): string | undefined => {
    const i = plain.indexOf(start);
    if (i < 0) return undefined;
    const s = i + start.length;
    const j = plain.indexOf(end, s);
    if (j < 0) return undefined;
    const v = plain.slice(s, j).trim();
    return v || undefined;
  };

  const name = between('Name ', 'Status');
  if (!name) return null;

  const status = between('Status ', 'Formation date');
  const formedRaw = between('Formation date ', 'ID number');
  const id = between('ID number ', 'Form');
  const principalStreet = between(
    'Principal office street address ',
    'Principal office mailing address'
  );
  const raBlockStart = plain.indexOf('Registered Agent');
  let registeredAgentName: string | undefined;
  let registeredAgentAddress: string | undefined;
  if (raBlockStart >= 0) {
    const ra = plain.slice(raBlockStart, raBlockStart + 800);
    registeredAgentName = ra.match(/Name\s+([^]+?)\s+Street address/)?.[1]?.trim();
    registeredAgentAddress = ra.match(/Street address\s+([^]+?)\s+Mailing address/)?.[1]?.trim();
  }

  return {
    entityName: name,
    sosId: id,
    status,
    formedDate: normalizeDate(formedRaw),
    registeredAgent:
      registeredAgentName || registeredAgentAddress
        ? { name: registeredAgentName, address: registeredAgentAddress }
        : undefined,
    principalAddress: principalStreet,
    profileUrl: detailUrl,
  };
}

function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Incoming "MM/DD/YYYY". Convert to ISO.
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
    console.warn('[sos] cache save failed:', (e as Error).message);
  }
}

const USER_AGENT = 'MultiFamilyAnalyzer/0.1 (+https://github.com/TalkStudioLLC)';
