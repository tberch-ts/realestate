import type { UnderwritingInput, UnderwritingOutput } from '@mfa/shared';

// Simple Year-1 multifamily underwriting.
// Uses interest-only debt service if ioYears > 0, otherwise standard amortization.
export function underwrite(u: UnderwritingInput): UnderwritingOutput {
  const closingCostsPct = u.closingCostsPct ?? 2;
  const marketRent = u.marketGrossRent ?? u.currentGrossRent;

  const grossScheduledRent = u.currentGrossRent;
  const vacancyLoss = grossScheduledRent * (u.vacancyPct / 100);
  const effectiveGrossIncome = grossScheduledRent - vacancyLoss;
  const operatingExpenses = effectiveGrossIncome * (u.opexPct / 100);
  const netOperatingIncome = effectiveGrossIncome - operatingExpenses;

  const loanAmount = u.purchasePrice * u.loan.ltv;
  const rehab = u.rehabBudget ?? 0;
  const closingCosts = u.purchasePrice * (closingCostsPct / 100);
  const equityRequired = u.purchasePrice - loanAmount + rehab + closingCosts;

  const monthlyRate = u.loan.ratePct / 100 / 12;
  const nMonths = u.loan.amortYears * 12;
  let monthlyDebtService: number;
  if (u.loan.ioYears && u.loan.ioYears > 0) {
    monthlyDebtService = loanAmount * monthlyRate;
  } else if (monthlyRate === 0) {
    monthlyDebtService = loanAmount / nMonths;
  } else {
    monthlyDebtService =
      (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nMonths));
  }
  const annualDebtService = monthlyDebtService * 12;

  const cashFlow = netOperatingIncome - annualDebtService;
  const dscr = annualDebtService > 0 ? netOperatingIncome / annualDebtService : Infinity;
  const capRatePct = u.purchasePrice > 0 ? (netOperatingIncome / u.purchasePrice) * 100 : 0;
  const cashOnCashPct = equityRequired > 0 ? (cashFlow / equityRequired) * 100 : 0;

  // Break-even occupancy: occupancy needed so EGI covers OpEx + ADS
  const breakEvenOccupancyPct =
    grossScheduledRent > 0
      ? ((operatingExpenses + annualDebtService) / grossScheduledRent) * 100
      : 0;

  const pricePerUnit = u.units > 0 ? u.purchasePrice / u.units : 0;
  const lossToLeasePct =
    marketRent > 0 && u.currentGrossRent > 0
      ? ((marketRent - u.currentGrossRent) / marketRent) * 100
      : undefined;

  return {
    grossScheduledRent: round(grossScheduledRent),
    effectiveGrossIncome: round(effectiveGrossIncome),
    operatingExpenses: round(operatingExpenses),
    netOperatingIncome: round(netOperatingIncome),
    capRatePct: round(capRatePct, 2),
    loanAmount: round(loanAmount),
    equityRequired: round(equityRequired),
    monthlyDebtService: round(monthlyDebtService),
    annualDebtService: round(annualDebtService),
    cashFlow: round(cashFlow),
    dscr: round(dscr, 2),
    cashOnCashPct: round(cashOnCashPct, 2),
    breakEvenOccupancyPct: round(breakEvenOccupancyPct, 1),
    pricePerUnit: round(pricePerUnit),
    lossToLeasePct: lossToLeasePct != null ? round(lossToLeasePct, 1) : undefined,
  };
}

function round(n: number, decimals = 0): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
