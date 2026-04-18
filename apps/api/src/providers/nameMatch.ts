// Fuzzy name matching for linking contacts (from Form D) to portfolio owners.
// Strategy: normalize by stripping legal suffixes + punctuation + whitespace,
// then exact + token-subset compare.

const LEGAL_SUFFIXES = [
  'llc', 'llp', 'lllp', 'lp',
  'inc', 'incorporated',
  'corp', 'corporation',
  'ltd', 'limited',
  'trust',
  'company', 'co',
  'partners', 'partnership',
  'group',
  'capital',
  'holdings',
  'management', 'mgmt',
  'fund', 'funds',
  'properties',
  'realty',
  'real estate',
  'apartments',
  'investments',
];

export function normalizeEntityName(raw: string): string {
  let s = raw.toLowerCase();
  // Replace punctuation / separators with spaces
  s = s.replace(/[.,'&/()\-]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Repeatedly strip a single legal suffix from the END until none left.
  // This handles "FOO CAPITAL LLC" -> "foo capital" -> "foo"  and "FOO LLC LLC" edge cases.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\s${suf}$`);
      if (re.test(s)) {
        s = s.replace(re, '').trim();
        changed = true;
      }
    }
  }
  return s;
}

// Returns a match quality score 0-100. 100 = identical after normalization.
// 80+ = one is a clean prefix of the other (e.g. "foo" vs "foo partners").
// Below 60 = weak or no match.
export function matchScore(a: string, b: string): number {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  // Token-set subset: every token in shorter appears in longer in same order
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let i = 0;
  for (const tok of long) {
    if (tok === short[i]) i++;
    if (i === short.length) break;
  }
  if (i === short.length) {
    // all shorter tokens found in order: prefix/subset match
    const ratio = short.length / long.length;
    return Math.round(60 + ratio * 30); // 60-90
  }
  return 0;
}
