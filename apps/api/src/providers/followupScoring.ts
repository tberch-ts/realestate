import type { FollowupProperty, FollowupScored, OwnerType } from '@mfa/shared';

// Shared follow-up scoring, extracted from denverFollowup.ts so every
// market's follow-up provider ranks candidates the same way. The only
// per-market input is `homeState` — the owner's mailing state is compared
// against it to flag out-of-state owners (a contact signal: an owner who
// lives elsewhere is more likely to sell/delegate).
//
// Scoring priorities, highest weight first:
//   1. Hold time  — long-held parcels (3yr → 0, 10yr → 100)
//   2. Owner type — individual/trust > small LLC > institutional
//   3. Recency    — tiebreaker
//   4. Out-of-state owner — small bonus
export function scoreFollowup(p: FollowupProperty, homeState: string): FollowupScored {
  const reasons: string[] = [];
  const now = new Date();

  // ---- Hold time ----
  let yearsHeld: number | undefined;
  if (p.saleDate) {
    const saleYear = Number(p.saleDate.slice(0, 4));
    if (Number.isFinite(saleYear) && saleYear > 1900) {
      yearsHeld = now.getFullYear() - saleYear;
    }
  }
  // 3yr = 0, 10yr = 100
  const holdScore =
    yearsHeld == null ? 50 : Math.max(0, Math.min(100, (yearsHeld - 3) * 14.3));
  if (yearsHeld != null && yearsHeld >= 7) reasons.push(`Owner has held ${yearsHeld}y`);

  // ---- Owner type ----
  const ownerType = classifyOwner(p.owner);
  const ownerScore =
    ownerType === 'individual' ? 95 : ownerType === 'llc' ? 75 : ownerType === 'institutional' ? 20 : 50;
  if (ownerType === 'individual') reasons.push('Individual/trust owner');
  else if (ownerType === 'llc') reasons.push('Small LLC owner');
  else if (ownerType === 'institutional') reasons.push('Institutional owner');

  // ---- Out-of-state owner ----
  const home = homeState.toUpperCase();
  const outOfStateOwner = p.ownerMailingState ? p.ownerMailingState.toUpperCase() !== home : undefined;
  if (outOfStateOwner) reasons.push(`Out-of-state owner (${p.ownerMailingState})`);

  // ---- Recency (tiebreaker) ----
  const recency = yearsHeld == null ? 50 : Math.max(0, 100 - yearsHeld * 5);

  // Final composite: long-hold and owner type dominate.
  const composite = Math.round(
    holdScore * 0.5 + ownerScore * 0.35 + recency * 0.1 + (outOfStateOwner ? 5 : 0)
  );

  return {
    ...p,
    score: Math.max(0, Math.min(100, composite)),
    signals: { yearsHeld, ownerType, outOfStateOwner },
    reasons,
  };
}

// Classify the owner-name string into institutional / llc / individual / unknown.
export function classifyOwner(raw?: string): OwnerType {
  if (!raw) return 'unknown';
  const n = raw.toUpperCase();

  const institutionalKeywords = [
    'REIT', 'CAPITAL', 'EQUITY', 'FUND', 'PROPERTIES INC', 'PROPERTIES CORP',
    'HOLDINGS', 'INVESTMENTS INC', 'MANAGEMENT', 'PARTNERS LP', 'ASSOC LP',
    'REAL ESTATE TRUST', 'OPERATING PARTNER', 'RESIDENTIAL INC',
    'APARTMENT COMMUNITIES', 'APARTMENTS INC', 'APARTMENTS CORP',
    'ESSEX', 'AVALONBAY', 'CAMDEN', 'UDR', 'EQUITY RESIDENTIAL',
    'AIMCO', 'MID-AMERICA', 'GREYSTAR', 'SECURITY PROPERTIES',
    'RELATED COMPANIES', 'LINCOLN PROPERTY', 'BELL PARTNERS',
    'BLACKSTONE', 'STARWOOD', 'LIV COMMUNITIES', 'ALLIANT',
    'STEADFAST', 'MILL CREEK', 'TRANSWESTERN',
  ];
  for (const kw of institutionalKeywords) {
    if (n.includes(kw)) return 'institutional';
  }

  // "TRUST" is tricky — family trusts are individual-ish.
  if (n.endsWith(' LLC') || n.includes(' LLC,') || /\bLLC\b/.test(n)) return 'llc';
  if (n.endsWith(' LP') || /\bLP\b/.test(n)) return 'llc'; // limited partnership, medium.
  if (n.includes('TRUST') && !n.includes('REAL ESTATE TRUST')) return 'individual';
  if (/^[A-Z\- .']+,\s*[A-Z\- .']+$/.test(n)) return 'individual'; // "LAST, FIRST"

  return 'unknown';
}
