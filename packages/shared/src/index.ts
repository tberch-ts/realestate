export type ProviderStatus =
  | 'ok'
  | 'needs_credentials'
  | 'needs_credits'
  | 'not_available'
  | 'error';

export interface ProviderResult<T = unknown> {
  provider: string;
  status: ProviderStatus;
  data?: T;
  message?: string;
  fetchedAt?: string;
}

export interface GeocodedAddress {
  formatted: string;
  lat: number;
  lng: number;
  placeId?: string;
  components?: Record<string, string>;
  stateCode?: string; // 2-letter USPS (CO, TX, ...)
  countyFips?: string; // 5-digit FIPS (state+county) once resolved by Census
  msa?: string; // CBSA code once resolved
}

export interface PropertySnapshot {
  address: string;
  geocode: ProviderResult<GeocodedAddress>;
  assessor: ProviderResult<AssessorRecord>;
  census: ProviderResult<CensusRecord>;
  hud: ProviderResult<HudRentRecord>;
  attom: ProviderResult<unknown>;
  rentcast: ProviderResult<unknown>;
  bls: ProviderResult<BlsRecord>;
  crime: ProviderResult<CrimeRecord>;
  landlord: ProviderResult<LandlordRecord>;
  buyBox: BuyBoxResult;
}

export interface AssessorRecord {
  parcelId?: string;
  owner?: string;
  assessedValue?: number;
  yearBuilt?: number;
  units?: number;
  sqft?: number;
  lotSqft?: number;
  propertyClass?: string;
  lastSalePrice?: number;
  lastSaleDate?: string;
  taxHistory?: Array<{ year: number; amount: number }>;
  source?: 'denver_residential' | 'denver_commercial' | 'other';
}

export interface CensusRecord {
  tract?: string;
  countyName?: string;
  stateCode?: string;
  medianHouseholdIncome?: number;
  population?: number;
  populationCounty?: number;
  populationGrowthPct5yr?: number;
  medianGrossRent?: number;
  rentBurdenedPct?: number;
}

export interface HudRentRecord {
  year: number;
  fmrByBedrooms: {
    studio?: number;
    oneBr?: number;
    twoBr?: number;
    threeBr?: number;
    fourBr?: number;
  };
}

export interface BlsRecord {
  stateCode: string;
  latestYear: number;
  latestValue: number;
  priorYearValue: number;
  yoyGrowthPct: number;
  seriesId: string;
  description: string;
}

export interface CrimeRecord {
  jurisdiction?: string;
  violentCrimeRate?: number; // per 100k
  nationalAverageRate?: number;
  belowAverage?: boolean;
  year?: number;
}

export interface LandlordRecord {
  stateCode: string;
  stateScore: number; // 0-100
  stateTier: 'friendly' | 'moderate' | 'unfriendly';
  cityOverride?: { city: string; tier: 'friendly' | 'moderate' | 'unfriendly'; notes?: string };
  notes?: string;
}

// ---------- Buy Box ----------

export type BuyBoxCriterion =
  | 'unitCount'
  | 'vintage'
  | 'dealSize'
  | 'assetClass'
  | 'msaPopulation'
  | 'populationGrowth'
  | 'jobGrowth'
  | 'crime'
  | 'landlordFriendly'
  | 'valueAddLevers';

export type BuyBoxOutcome = 'pass' | 'fail' | 'borderline' | 'unknown';

export interface BuyBoxCriterionResult {
  criterion: BuyBoxCriterion;
  label: string;
  outcome: BuyBoxOutcome;
  actual?: string;
  target: string;
  note?: string;
}

export interface BuyBoxResult {
  score: number; // 0-100
  outcome: BuyBoxOutcome;
  criteria: BuyBoxCriterionResult[];
  whyPursue: string[];
  whyPass: string[];
}

// Underwriting (Phase 3)
export interface UnderwritingInput {
  purchasePrice: number;
  units: number;
  currentGrossRent: number;
  marketGrossRent?: number;
  vacancyPct: number;
  opexPct: number;
  loan: {
    ltv: number;
    ratePct: number;
    amortYears: number;
    ioYears?: number;
  };
  rehabBudget?: number;
  closingCostsPct?: number;
}

export interface UnderwritingOutput {
  grossScheduledRent: number;
  effectiveGrossIncome: number;
  netOperatingIncome: number;
  capRatePct: number;
  dscr: number;
  cashOnCashPct: number;
  breakEvenOccupancyPct: number;
  annualDebtService: number;
}
