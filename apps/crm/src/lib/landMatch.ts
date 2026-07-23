import type { LandLeadScored } from '@mfa/shared';
import type { BuilderBuyBox, BuyBoxZipRow } from './collections';

// Matches a vacant-lot lead against the user's active builder buy boxes,
// client-side (buy boxes are the user's own Firestore docs). A match means
// "this builder buys lots exactly like this one" — the core of the flip:
// builder pays row.price, you contract the owner at suggestedOffer, the
// difference is your assignment fee.

export const DEFAULT_TARGET_SPREAD = 10000;

export interface BuyBoxMatch {
  box: BuilderBuyBox;
  row: BuyBoxZipRow;
  pass: boolean;
  failures: string[];       // human-readable, e.g. "0.08 ac < 0.10 ac min"
  builderPrice: number;
  suggestedOffer: number;   // builderPrice − targetSpread, floored at 0
}

export function matchLeadToBuyBoxes(
  lead: LandLeadScored,
  boxes: BuilderBuyBox[],
  fallbackSpread = DEFAULT_TARGET_SPREAD
): BuyBoxMatch[] {
  const matches: BuyBoxMatch[] = [];
  const leadZip = lead.zip?.slice(0, 5);
  if (!leadZip) return matches;

  for (const box of boxes) {
    if (!box.active) continue;
    for (const row of box.zipRows ?? []) {
      if (row.zip.slice(0, 5) !== leadZip) continue;

      const failures: string[] = [];
      const acres = lead.lotAcres;
      if (row.minAcres != null && acres != null && acres < row.minAcres) {
        failures.push(`${fmtAcres(acres)} ac < ${fmtAcres(row.minAcres)} ac min`);
      }
      if (row.maxAcres != null && acres != null && acres > row.maxAcres) {
        failures.push(`${fmtAcres(acres)} ac > ${fmtAcres(row.maxAcres)} ac max`);
      }
      if ((row.minAcres != null || row.maxAcres != null) && acres == null) {
        failures.push('lot size unknown');
      }

      const spread = box.targetSpread ?? fallbackSpread;
      matches.push({
        box,
        row,
        pass: failures.length === 0,
        failures,
        builderPrice: row.price,
        suggestedOffer: Math.max(0, row.price - spread),
      });
    }
  }

  // Best first: passing matches by highest builder price, then near-misses.
  return matches.sort((a, b) => Number(b.pass) - Number(a.pass) || b.builderPrice - a.builderPrice);
}

export function bestMatch(matches: BuyBoxMatch[]): BuyBoxMatch | undefined {
  return matches.find((m) => m.pass) ?? matches[0];
}

function fmtAcres(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
}
