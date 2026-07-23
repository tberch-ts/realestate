import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BuilderContact,
  BuilderDetail,
  BuilderParcelSample,
  BuilderRecord,
  BuilderSearchFilters,
  BuilderSearchResult,
  MarketKey,
  ProviderResult,
} from '@mfa/shared';
import { classifyLandOwner, num, str } from './landCommon.js';
import {
  arcgisQuery,
  LAND_PARCEL_SOURCES,
  zip5,
  type LandParcelSource,
} from './landArcgis.js';
import { fetchLandSaturation } from './landSaturation.js';
import { fetchSosByState } from './sosDispatcher.js';

// Builder discovery ("Builder Buy Boxes" search): find the builders and
// developers behind the activity the Saturation Map shows. A builder is a
// business-entity current owner of (a) new-construction parcels built in
// the last ~2 years, or (b) vacant lots bought in the last 12 months — the
// grantee of a just-sold lot is the builder acquiring land to build on.
//
// Identity is a heuristic on current-owner parcel data (these county
// FeatureServers carry no deed grantor/grantee history). We aggregate by
// owner via a single groupBy-stats query per signal (owner × ZIP counts),
// keep only business entities, and score each builder on build volume +
// the Saturation score of the ZIPs they build in. Contact enrichment
// (mailing address + Secretary-of-State registered agent) is lazy, on the
// detail endpoint, so the list stays fast.

const memCache = new Map<MarketKey, { builders: BuilderRecord[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const cacheFile = (m: MarketKey) => path.join(CACHE_DIR, `builders_${m}.json`);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

// ---------- public API ----------

export async function fetchBuilders(
  market: MarketKey,
  filters: BuilderSearchFilters = {}
): Promise<ProviderResult<BuilderSearchResult>> {
  const provider = `${market}_builders`;
  const source = LAND_PARCEL_SOURCES[market];
  if (!source) {
    return {
      provider,
      status: 'not_available',
      message: `Builder search isn't available for '${market}' yet — needs a verified parcel source (see landArcgis.ts).`,
    };
  }

  try {
    const builders = await loadBuilders(market, source);
    const filtered = applyFilters(builders, filters);
    const data: BuilderSearchResult = {
      market,
      count: filtered.length,
      filters,
      builders: filtered,
    };
    return { provider, status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

export async function fetchBuilderDetail(
  market: MarketKey,
  name: string
): Promise<ProviderResult<BuilderDetail>> {
  const provider = `${market}_builder_detail`;
  const source = LAND_PARCEL_SOURCES[market];
  if (!source) {
    return { provider, status: 'not_available', message: `Builder search isn't available for '${market}'.` };
  }

  try {
    const builders = await loadBuilders(market, source);
    const record = builders.find((b) => groupKey(b.name) === groupKey(name));
    if (!record) {
      return { provider, status: 'not_available', message: `No builder named "${name}" in ${market}.` };
    }

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const minYear = now.getFullYear() - 2;

    const [newBuilds, soldLots] = await Promise.all([
      queryOwnerParcels(source, record.name, source.newConWhere(minYear), 'newBuild', 12),
      queryOwnerParcels(source, record.name, source.soldWhere(cutoffIso), 'soldLot', 12),
    ]);
    const sampleParcels = [...newBuilds.samples, ...soldLots.samples].slice(0, 20);
    const mailingAddress = newBuilds.mailingAddress ?? soldLots.mailingAddress;
    const mailingState = newBuilds.mailingState ?? soldLots.mailingState;

    const contact = await buildContact(record.name, source.homeState, mailingAddress, mailingState);

    const data: BuilderDetail = { ...record, contact, sampleParcels };
    return { provider, status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

// ---------- build + score the full builder list (cached per market) ----------

async function loadBuilders(market: MarketKey, source: LandParcelSource): Promise<BuilderRecord[]> {
  if (!memCache.has(market)) await loadDiskCache(market);
  const hit = memCache.get(market);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.builders;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const minYear = now.getFullYear() - 2;

  // Per-ZIP Saturation scores (reused, already cached by that provider).
  const zipScore = new Map<string, number>();
  const sat = await fetchLandSaturation(market);
  if (sat.status === 'ok' && sat.data) {
    for (const f of sat.data.features) zipScore.set(f.properties.name, f.properties.score);
  }

  const [newCon, sold] = await Promise.all([
    fetchOwnerZipCounts(source, source.newConWhere(minYear)),
    fetchOwnerZipCounts(source, source.soldWhere(cutoffIso)),
  ]);

  interface Agg {
    displayName: string;
    homesBuilt: number;
    lotsAcquired: number;
    zipCounts: Map<string, number>;
  }
  const byOwner = new Map<string, Agg>();
  const add = (owner: string, zip: string | undefined, n: number, kind: 'new' | 'sold') => {
    const cls = classifyBuilder(owner);
    if (!cls.include) return;
    const key = groupKey(owner);
    const a = byOwner.get(key) ?? { displayName: owner.trim(), homesBuilt: 0, lotsAcquired: 0, zipCounts: new Map() };
    if (kind === 'new') a.homesBuilt += n;
    else a.lotsAcquired += n;
    if (zip) a.zipCounts.set(zip, (a.zipCounts.get(zip) ?? 0) + n);
    byOwner.set(key, a);
  };
  for (const r of newCon) add(r.owner, r.zip, r.n, 'new');
  for (const r of sold) add(r.owner, r.zip, r.n, 'sold');

  // Volume normalized sub-linearly (sqrt) so one mega-builder doesn't flatten
  // everyone else; blended 50/50 with the ZIPs' Saturation scores.
  const volumes = [...byOwner.values()].map((a) => a.homesBuilt + a.lotsAcquired);
  const maxVol = Math.max(1, ...volumes);

  const builders: BuilderRecord[] = [];
  for (const a of byOwner.values()) {
    const volume = a.homesBuilt + a.lotsAcquired;
    const zipsByCount = [...a.zipCounts.entries()].sort((x, y) => y[1] - x[1]);
    const totalZipCount = zipsByCount.reduce((s, [, c]) => s + c, 0) || 1;
    const avgZipSaturation = Math.round(
      zipsByCount.reduce((s, [zip, c]) => s + (zipScore.get(zip) ?? 0) * c, 0) / totalZipCount
    );
    const volumeScore = 100 * (Math.sqrt(volume) / Math.sqrt(maxVol));
    const score = Math.round(0.5 * volumeScore + 0.5 * avgZipSaturation);
    const cls = classifyBuilder(a.displayName);
    builders.push({
      name: a.displayName,
      ownerType: cls.ownerType,
      isKnownBuilder: cls.isKnownBuilder,
      score: Math.max(0, Math.min(100, score)),
      homesBuilt24mo: a.homesBuilt,
      lotsAcquired12mo: a.lotsAcquired,
      zips: zipsByCount.map(([z]) => z),
      avgZipSaturation,
      topZip: zipsByCount[0]?.[0],
    });
  }

  builders.sort((x, y) => y.score - x.score);
  memCache.set(market, { builders, ts: Date.now() });
  await saveDiskCache(market);
  return builders;
}

function applyFilters(builders: BuilderRecord[], f: BuilderSearchFilters): BuilderRecord[] {
  const limit = Math.min(f.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const zipSet = f.zips?.length ? new Set(f.zips.map((z) => z.trim())) : null;
  return builders
    .filter((b) => {
      if (f.minHomesBuilt != null && b.homesBuilt24mo < f.minHomesBuilt) return false;
      if (f.minScore != null && b.score < f.minScore) return false;
      if (zipSet && !b.zips.some((z) => zipSet.has(z))) return false;
      return true;
    })
    .slice(0, limit);
}

// ---------- owner classification ----------

// Non-builder entities that own new construction / vacant land in bulk but
// aren't developers to contact (governments, HOAs, churches, utilities, junk).
const EXCLUDE_TOKENS = [
  'CONFIDENTIAL', 'COUNTY', 'CITY OF', 'TOWN OF', 'STATE OF', 'SCHOOL',
  'HOUSING AUTH', 'AUTHORITY', 'CHURCH', 'DIOCESE', 'MINISTR', 'ASSOCIATION',
  'HOMEOWNER', ' HOA', 'WATER MANAGEMENT', ' UTILIT', 'DEPARTMENT',
  'UNIVERSITY', 'COLLEGE', 'HOSPITAL', 'FOUNDATION', 'CEMETERY',
];

// Names that clearly mark a homebuilder/developer (badge + always include).
const BUILDER_TOKENS = [
  'HOMES', 'HOME BUILDER', 'HOMEBUILD', 'BUILDER', 'CONSTRUCTION', 'CONSTRUCTORS',
  'DEVELOP', 'COMMUNITIES', 'RESIDENTIAL', 'DR HORTON', 'D R HORTON', 'LENNAR',
  'PULTE', 'KB HOME', 'MERITAGE', 'RYAN HOMES', 'NVR', 'TAYLOR MORRISON', 'TOLL',
  'MATTAMY', 'CENTURY COMMUNITIES', 'HOVNANIAN', 'M/I HOMES', 'MI HOMES',
  'DREAM FINDERS', 'DAVID WEEKLEY', 'GL HOMES', 'PARK SQUARE', 'ICI HOMES',
  'ASHTON WOODS', 'TRI POINTE', 'LGI HOMES', 'HIGHLAND HOMES', 'BEAZER',
];

// Generic business-entity suffixes (include, but no builder badge).
const BUSINESS_RE = /\b(LLC|L\.?L\.?C|LP|L\.?P\.?|INC|CORP|CORPORATION|LTD|LLP|COMPANY|PARTNERS|PARTNERSHIP|GROUP|HOLDINGS|INVESTMENTS|PROPERTIES|CAPITAL|ENTERPRISES|VENTURES|REALTY|BUILDING)\b/;

interface BuilderClass {
  include: boolean;
  isKnownBuilder: boolean;
  ownerType: BuilderRecord['ownerType'];
}

function classifyBuilder(raw: string): BuilderClass {
  const upper = raw.toUpperCase();
  const ownerType = classifyLandOwner(raw);
  const base = { isKnownBuilder: false, ownerType };

  if (!upper.replace(/[^A-Z0-9]/g, '')) return { ...base, include: false };
  if (EXCLUDE_TOKENS.some((t) => upper.includes(t))) return { ...base, include: false };
  // Individuals/trusts are never builders even if they hold a couple of lots.
  if (ownerType === 'individual') return { ...base, include: false };

  const isKnownBuilder = BUILDER_TOKENS.some((t) => upper.includes(t));
  const isBusiness = isKnownBuilder || BUSINESS_RE.test(upper);
  return { include: isBusiness, isKnownBuilder, ownerType };
}

// Group key merges casing / whitespace variants of the same entity name.
function groupKey(name: string): string {
  return name.toUpperCase().replace(/\s+/g, ' ').trim();
}

// ---------- upstream fetches ----------

// One groupBy-stats request → owner × ZIP counts, ordered by count desc.
// The biggest builders are guaranteed in the first page; the long tail
// (tiny counts, low score) is filtered out anyway.
async function fetchOwnerZipCounts(
  source: LandParcelSource,
  where: string
): Promise<Array<{ owner: string; zip?: string; n: number }>> {
  const feats = await arcgisQuery(source.url, {
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
    ]),
    groupByFieldsForStatistics: `${source.ownerField},${source.zipField}`,
    orderByFields: 'n DESC',
    resultRecordCount: '5000',
    f: 'json',
  });
  const out: Array<{ owner: string; zip?: string; n: number }> = [];
  for (const f of feats) {
    const owner = str(f.attributes[source.ownerField]);
    if (!owner) continue;
    const n = num(f.attributes.n) ?? num(f.attributes.N) ?? 0;
    if (n <= 0) continue;
    out.push({ owner, zip: zip5(str(f.attributes[source.zipField])), n });
  }
  return out;
}

// Sample parcels for one builder (detail view): mailing address + a few
// example properties. Matched with LIKE to tolerate trailing-space / padding
// quirks in the county OWNER field.
async function queryOwnerParcels(
  source: LandParcelSource,
  name: string,
  where: string,
  kind: BuilderParcelSample['kind'],
  limit: number
): Promise<{ samples: BuilderParcelSample[]; mailingAddress?: string; mailingState?: string }> {
  const like = `${name.replace(/'/g, "''")}%`;
  const outFields = Array.from(
    new Set([
      source.ownerField,
      source.parcelIdField,
      source.zipField,
      ...(source.siteAddrField ? [source.siteAddrField] : []),
      ...source.mailingFields,
    ])
  ).join(',');

  const feats = await arcgisQuery(source.url, {
    where: `${source.ownerField} LIKE '${like}' AND (${where})`,
    outFields,
    returnGeometry: 'false',
    resultRecordCount: String(limit),
    f: 'json',
  });

  const samples: BuilderParcelSample[] = [];
  let mailingAddress: string | undefined;
  let mailingState: string | undefined;
  for (const f of feats) {
    const a = f.attributes;
    if (!mailingAddress) {
      mailingAddress = source.mailingFields.map((fn) => str(a[fn])).filter(Boolean).join(', ') || undefined;
      mailingState = str(a.STATE) ?? stateFromText(mailingAddress);
    }
    samples.push({
      parcelId: str(a[source.parcelIdField]),
      address: source.siteAddrField ? str(a[source.siteAddrField]) : undefined,
      zip: zip5(str(a[source.zipField])),
      kind,
    });
  }
  return { samples, mailingAddress, mailingState };
}

function stateFromText(s?: string): string | undefined {
  if (!s) return undefined;
  const m = /\b([A-Z]{2})\b(?:\s+\d{5})?/.exec(s.toUpperCase());
  return m ? m[1] : undefined;
}

// ---------- contact enrichment (Secretary of State) ----------

async function buildContact(
  name: string,
  homeState: string,
  mailingAddress?: string,
  mailingState?: string
): Promise<BuilderContact> {
  const portal = sosPortalFor(homeState);
  const base: BuilderContact = { sosStatus: 'not_available', mailingAddress, mailingState, sosPortalUrl: portal };

  let sos: Awaited<ReturnType<typeof fetchSosByState>>;
  try {
    sos = await fetchSosByState(name, homeState);
  } catch (err) {
    return { ...base, sosStatus: 'error', message: (err as Error).message };
  }

  if (sos.status === 'ok' && sos.data) {
    return {
      ...base,
      sosStatus: 'ok',
      entityName: sos.data.entityName,
      registeredAgent: sos.data.registeredAgent,
      principalAddress: sos.data.principalAddress,
      sosProfileUrl: sos.data.profileUrl,
    };
  }
  if (sos.status === 'needs_credentials' || sos.status === 'error') {
    return { ...base, sosStatus: sos.status, message: sos.message };
  }
  // 'ok' with no match, or 'not_available' (no scraper for this state).
  return { ...base, sosStatus: 'not_available', message: sos.message };
}

function sosPortalFor(state: string): string | undefined {
  switch (state.toUpperCase()) {
    case 'FL':
      return 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName';
    case 'NC':
      return 'https://www.sosnc.gov/online_services/search/by_title/_Business_Registration';
    case 'CO':
      return 'https://www.sos.state.co.us/biz/AdvancedSearchCriteria.do';
    default:
      return undefined;
  }
}

// ---------- disk cache (same shape as landSaturation.ts) ----------

async function loadDiskCache(market: MarketKey): Promise<void> {
  try {
    const raw = await readFile(cacheFile(market), 'utf8');
    const parsed = JSON.parse(raw) as { builders: BuilderRecord[]; ts: number };
    if (parsed?.builders) memCache.set(market, parsed);
  } catch {
    // No cache file yet — fine.
  }
}

async function saveDiskCache(market: MarketKey): Promise<void> {
  const entry = memCache.get(market);
  if (!entry) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(market), JSON.stringify(entry));
  } catch (e) {
    console.warn(`[builders:${market}] could not persist cache:`, (e as Error).message);
  }
}
