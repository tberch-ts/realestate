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
  stateCode?: string;
  countyFips?: string;
  msa?: string;
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
  violentCrimeRate?: number;
  nationalAverageRate?: number;
  belowAverage?: boolean;
  year?: number;
}

export interface LandlordRecord {
  stateCode: string;
  stateScore: number;
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
  score: number;        // headline = max(marketScore, fullScore)
  marketScore: number;  // public-data criteria only — computable without deal form
  fullScore: number;    // all criteria including deal-form inputs
  outcome: BuyBoxOutcome;
  criteria: BuyBoxCriterionResult[];
  whyPursue: string[];
  whyPass: string[];
}

// ---------- Deals & Underwriting ----------

export type AssetClass = 'A' | 'B' | 'C' | 'D' | 'unknown';

export const VALUE_ADD_LEVERS = [
  'unit_renovation',
  'exterior_common_area',
  'rubs_utility_billback',
  'below_market_rents',
  'operational_efficiency',
  'premium_amenities',
  'reposition',
  'tax_appeal',
  'refinance_at_stabilization',
] as const;
export type ValueAddLever = (typeof VALUE_ADD_LEVERS)[number];

export const VALUE_ADD_LEVER_LABELS: Record<ValueAddLever, string> = {
  unit_renovation: 'Unit interior renovation',
  exterior_common_area: 'Exterior / common area upgrade',
  rubs_utility_billback: 'RUBS / utility bill-back',
  below_market_rents: 'Below-market rents (loss-to-lease)',
  operational_efficiency: 'Operational inefficiency',
  premium_amenities: 'Premium amenities (parking, storage, pet, laundry)',
  reposition: 'Asset-class reposition',
  tax_appeal: 'Property-tax appeal',
  refinance_at_stabilization: 'Refinance at stabilization',
};

export interface UnderwritingInput {
  purchasePrice: number;
  units: number;
  currentGrossRent: number; // annual $
  marketGrossRent?: number; // annual $
  vacancyPct: number;
  opexPct: number; // % of EGI
  loan: {
    ltv: number; // 0-1
    ratePct: number; // annual %
    amortYears: number;
    ioYears?: number;
  };
  rehabBudget?: number;
  closingCostsPct?: number; // % of purchase price, default 2
}

export interface UnderwritingOutput {
  grossScheduledRent: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  capRatePct: number;
  loanAmount: number;
  equityRequired: number;
  monthlyDebtService: number;
  annualDebtService: number;
  cashFlow: number;
  dscr: number;
  cashOnCashPct: number;
  breakEvenOccupancyPct: number;
  pricePerUnit: number;
  lossToLeasePct?: number;
}

export interface DealInput {
  propertyId?: number;
  address: string;
  name?: string;
  assetClass?: AssetClass;
  levers?: ValueAddLever[];
  notes?: string;
  underwriting: UnderwritingInput;
}

export interface DealRecord {
  id: number;
  propertyId: number;
  address: string;
  name?: string;
  assetClass?: AssetClass;
  levers: ValueAddLever[];
  notes?: string;
  status: string;
  underwriting: UnderwritingInput;
  underwritingOutput: UnderwritingOutput;
  createdAt: string;
  updatedAt: string;
}

// ---------- Letter of Intent ----------

export interface LoiInput {
  // Parties
  buyerEntity: string;          // "Acme Multifamily LLC"
  buyerContact?: string;        // "Tom Berchenbriter"
  buyerAddress?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  sellerEntity: string;
  sellerContact?: string;
  sellerAddress?: string;

  // Deal terms
  effectiveDate: string;        // ISO date
  expirationDate: string;       // offer valid until
  closingDays: number;          // days to close after inspection
  inspectionDays: number;       // due diligence period
  financingDays?: number;       // 0 if waived
  earnestMoney: number;         // initial deposit
  additionalDeposit?: number;   // released after DD
  earnestMoneyRefundable: boolean;

  // Contingencies & rights
  assignmentRights: boolean;
  financingContingency: boolean;
  inspectionContingency: boolean;
  titleReviewDays: number;

  // Due diligence materials requested
  ddMaterials: string[];        // list of items to request

  // Special provisions / additional notes
  specialTerms?: string;
  brokerFee?: string;           // e.g. "2% to Seller's broker"
}

// ---------- LOI drafts ----------

export type LoiDraftStatus = 'draft' | 'sent' | 'archived';

export interface LoiDealContext {
  address: string;
  name?: string;
  units?: number;
  assetClass?: AssetClass;
  purchasePrice?: number;     // copied out of underwriting for quick access on the LOI form
}

export interface LoiDraft {
  id: number;
  address: string;
  dealId?: number;
  propertyId?: number;
  loi: LoiInput;
  dealContext: LoiDealContext;
  status: LoiDraftStatus;
  createdAt: string;
  updatedAt: string;
}

// Payload the LOI form sends on create.
export interface LoiDraftCreate {
  address: string;
  dealId?: number;
  propertyId?: number;
  loi: LoiInput;
  dealContext: LoiDealContext;
}

// Payload the LOI form sends on autosave.
export interface LoiDraftPatch {
  loi?: LoiInput;
  dealContext?: LoiDealContext;
  status?: LoiDraftStatus;
}

// ---------- Follow-up prospects ----------

export type OwnerType = 'individual' | 'llc' | 'institutional' | 'unknown';

export interface FollowupProperty {
  parcelId?: string;            // SITUS_ADDRESS_ID or similar
  address: string;
  owner?: string;
  ownerMailingState?: string;   // out-of-state owner = another contact signal
  units?: number;
  yearBuilt?: number;
  salePrice?: number;
  saleDate?: string;            // ISO
  sqft?: number;
  propertyClass?: string;
  centroid: [number, number];   // [lng, lat]
}

export interface FollowupScored extends FollowupProperty {
  score: number;                // 0-100 composite priority
  signals: {
    yearsHeld?: number;
    ownerType: OwnerType;
    outOfStateOwner?: boolean;
  };
  reasons: string[];             // short human-readable reasons
}

export interface FollowupResult {
  zone: string;
  count: number;
  candidates: FollowupScored[];
}

// ---------- Ownership / portfolio ----------

export interface OwnerCluster {
  owner: string;
  ownerType: OwnerType;
  mailingState?: string;
  outOfState: boolean;
  propertyCount: number;
  totalUnits: number;
  avgYearBuilt?: number;
  properties: FollowupScored[];
}

// ---------- Colorado SOS ----------

export interface SosEntity {
  entityName: string;
  sosId?: string;              // Colorado Entity ID
  status?: string;             // 'Good Standing' | 'Delinquent' | ...
  formedDate?: string;         // ISO date
  registeredAgent?: {
    name?: string;
    address?: string;
  };
  principalAddress?: string;
  profileUrl?: string;         // deep link back to SOS page
}
