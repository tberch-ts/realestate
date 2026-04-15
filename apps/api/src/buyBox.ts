import type {
  BuyBoxCriterionResult,
  BuyBoxOutcome,
  BuyBoxResult,
  PropertySnapshot,
} from '@mfa/shared';

// Pure scoring — takes a snapshot (minus buyBox itself) + optional deal inputs,
// returns per-criterion outcomes and an overall 0-100 score.
export function scoreBuyBox(
  snapshot: Omit<PropertySnapshot, 'buyBox'>,
  inputs: { purchasePrice?: number; leverCount?: number } = {}
): BuyBoxResult {
  const criteria: BuyBoxCriterionResult[] = [];

  // ---- Unit count: must be 100+ ----
  const units = snapshot.assessor.data?.units;
  criteria.push({
    criterion: 'unitCount',
    label: '100+ units',
    target: '≥ 100',
    outcome: units == null ? 'unknown' : units >= 100 ? 'pass' : 'fail',
    actual: units == null ? undefined : `${units} units`,
    note:
      snapshot.assessor.data?.source === 'denver_residential'
        ? 'Sourced from Denver residential dataset; confirm for commercial multifamily.'
        : undefined,
  });

  // ---- Vintage: 1990 or newer ----
  const year = snapshot.assessor.data?.yearBuilt;
  criteria.push({
    criterion: 'vintage',
    label: 'Built 1990 or newer',
    target: '≥ 1990',
    outcome: year == null ? 'unknown' : year >= 1990 ? 'pass' : 'fail',
    actual: year == null ? undefined : String(year),
  });

  // ---- Deal size: $30-100M ----
  const price = inputs.purchasePrice;
  criteria.push({
    criterion: 'dealSize',
    label: 'Deal size $30M – $100M',
    target: '$30M – $100M',
    outcome:
      price == null
        ? 'unknown'
        : price >= 30_000_000 && price <= 100_000_000
        ? 'pass'
        : price >= 20_000_000 && price <= 120_000_000
        ? 'borderline'
        : 'fail',
    actual: price == null ? undefined : fmtMoney(price),
    note: price == null ? 'Enter purchase price on deal form.' : undefined,
  });

  // ---- Asset class: checklist placeholder ----
  criteria.push({
    criterion: 'assetClass',
    label: 'A or B asset class',
    target: 'A or B',
    outcome: 'unknown',
    note: 'Set manually on deal form (cannot be reliably inferred from public data).',
  });

  // ---- MSA population: 100k+ (county as proxy) ----
  const popCounty = snapshot.census.data?.populationCounty;
  criteria.push({
    criterion: 'msaPopulation',
    label: 'MSA population 100k+',
    target: '≥ 100,000',
    outcome: popCounty == null ? 'unknown' : popCounty >= 100_000 ? 'pass' : 'fail',
    actual:
      popCounty == null
        ? undefined
        : `${popCounty.toLocaleString('en-US')} (${snapshot.census.data?.countyName})`,
  });

  // ---- Population growth: positive ----
  const growth = snapshot.census.data?.populationGrowthPct5yr;
  criteria.push({
    criterion: 'populationGrowth',
    label: 'Population growing',
    target: '> 0% (5-yr)',
    outcome:
      growth == null ? 'unknown' : growth > 1 ? 'pass' : growth > 0 ? 'borderline' : 'fail',
    actual: growth == null ? undefined : `${growth.toFixed(2)}% (5-yr)`,
  });

  // ---- Job growth: positive YoY ----
  const jobs = snapshot.bls.data?.yoyGrowthPct;
  criteria.push({
    criterion: 'jobGrowth',
    label: 'Job growth positive',
    target: '> 0% YoY',
    outcome: jobs == null ? 'unknown' : jobs > 1 ? 'pass' : jobs > 0 ? 'borderline' : 'fail',
    actual: jobs == null ? undefined : `${jobs.toFixed(2)}% YoY (state)`,
  });

  // ---- Crime: below national average ----
  const crime = snapshot.crime.data;
  criteria.push({
    criterion: 'crime',
    label: 'Crime below national avg',
    target: 'Violent crime ≤ national baseline',
    outcome:
      crime?.belowAverage === true
        ? 'pass'
        : crime?.belowAverage === false
        ? 'fail'
        : 'unknown',
    actual:
      crime?.violentCrimeRate != null
        ? `${crime.violentCrimeRate.toFixed(0)}/100k vs ${crime.nationalAverageRate?.toFixed(0) ?? '?'}`
        : undefined,
    note: crime ? undefined : 'Add FBI_API_KEY to enable.',
  });

  // ---- Landlord friendliness ----
  const ll = snapshot.landlord.data;
  criteria.push({
    criterion: 'landlordFriendly',
    label: 'Landlord-friendly market',
    target: 'Tier: friendly or moderate',
    outcome:
      ll?.stateTier === 'friendly'
        ? 'pass'
        : ll?.stateTier === 'moderate'
        ? 'borderline'
        : ll?.stateTier === 'unfriendly'
        ? 'fail'
        : 'unknown',
    actual: ll ? `${ll.stateCode}: ${ll.stateTier} (${ll.stateScore}/100)` : undefined,
    note: ll?.cityOverride ? `${ll.cityOverride.city}: ${ll.cityOverride.tier}` : ll?.notes,
  });

  // ---- Value-add levers: user-entered checklist ----
  const levers = inputs.leverCount;
  criteria.push({
    criterion: 'valueAddLevers',
    label: 'Value-add levers 2-3+',
    target: '≥ 2',
    outcome: levers == null ? 'unknown' : levers >= 2 ? 'pass' : 'fail',
    actual: levers == null ? undefined : `${levers} identified`,
    note: levers == null ? 'Set manually on deal form.' : undefined,
  });

  return summarize(criteria);
}

function summarize(criteria: BuyBoxCriterionResult[]): BuyBoxResult {
  // Score: pass=1, borderline=0.5, fail=0, unknown=0.5 (neutral)
  const weights: Record<BuyBoxOutcome, number> = {
    pass: 1,
    borderline: 0.5,
    fail: 0,
    unknown: 0.5,
  };
  const total = criteria.reduce((sum, c) => sum + weights[c.outcome], 0);
  const score = Math.round((total / criteria.length) * 100);

  const whyPursue = criteria
    .filter((c) => c.outcome === 'pass')
    .map((c) => `${c.label}${c.actual ? ` (${c.actual})` : ''}`);
  const whyPass = criteria
    .filter((c) => c.outcome === 'fail')
    .map((c) => `${c.label}${c.actual ? ` — ${c.actual}` : ''} vs target ${c.target}`);

  let outcome: BuyBoxOutcome = 'unknown';
  const failCount = criteria.filter((c) => c.outcome === 'fail').length;
  const passCount = criteria.filter((c) => c.outcome === 'pass').length;
  if (failCount >= 2) outcome = 'fail';
  else if (failCount === 1) outcome = 'borderline';
  else if (passCount >= 5) outcome = 'pass';
  else outcome = 'borderline';

  return { score, outcome, criteria, whyPursue, whyPass };
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
