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
}

export interface PropertySnapshot {
  address: string;
  geocode: ProviderResult<GeocodedAddress>;
  assessor: ProviderResult<AssessorRecord>;
  census: ProviderResult<CensusRecord>;
  hud: ProviderResult<HudRentRecord>;
  attom: ProviderResult<unknown>;
  rentcast: ProviderResult<unknown>;
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
}

export interface CensusRecord {
  tract?: string;
  medianHouseholdIncome?: number;
  population?: number;
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

// Underwriting (placeholder for Phase 3)
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
