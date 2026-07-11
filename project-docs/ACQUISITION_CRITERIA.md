# Acquisition Criteria

The "buy box" — everything below defines what MultiFamily Analyzer is trying to help acquire.
Every screen, filter, score, and alert in the app should flow from this.

## Asset profile

| Criterion | Target | Notes |
|---|---|---|
| Asset class | **A or B** | Institutional quality. No C/D product. |
| Sub-market | A's and B's in **B sub-markets** acceptable | The sweet spot — A/B building in an improving B area is a classic value play. |
| Play type | **Value-add** | Must have 2–3 identifiable levers (see below). Not core/core-plus stabilized. |
| Unit count | **100+ units** | Hard floor. |
| Vintage | **1990 or newer** | Avoids pre-1990 capex headaches (galvanized plumbing, asbestos, old electrical). |
| Deal size | **$30M – $100M** | Below $30M = too small for institutional debt/equity. Above $100M = outside our current sandbox. |

## Market profile

| Criterion | Target | Source |
|---|---|---|
| MSA population | **100,000+** | US Census ACS, BLS |
| Population growth | **Positive, ideally 1%+ YoY or 5%+ 5-yr** | Census |
| Job growth | **Positive, trending up** | BLS QCEW / CES |
| Crime rate | **Below national average (violent crime)** | FBI UCR; some MSAs have better local feeds |
| Landlord friendliness | **Landlord-friendly** state & city (no rent control, reasonable eviction, no "just cause") | Manual scoring table (state + city overrides) |

## Value-add levers (need at least 2–3)

Every underwritten deal should document which of these apply:

1. **Unit interior renovation** — paint, flooring, appliances, fixtures → $X rent bump per unit
2. **Exterior / common area** — paint, landscaping, signage, amenity upgrades
3. **RUBS / utility bill-back** — pass-through water, trash, sewer
4. **Below-market rents** — loss-to-lease ≥ 5–10% vs. submarket comps
5. **Operational inefficiency** — high opex ratio, sloppy vendor contracts, bad collections
6. **Premium amenities** — covered parking, storage, package lockers, pet fees, in-unit laundry adds
7. **Reposition** — rebrand, reposition asset class (B → B+ via capex)
8. **Property tax appeal** — over-assessed properties
9. **Refinance at stabilization** — cash-out after NOI lift

If a deal has fewer than 2 credible levers, pass.

## Denver v1 specifics

- **MSA:** Denver-Aurora-Lakewood, CO (population ~3M)
- **Pop growth:** historically strong, moderating
- **Job growth:** positive (tech, aerospace, energy, healthcare)
- **Landlord friendly?** **Moderate.** Colorado has no statewide rent control, but Denver has HB23-1115 limits and increased tenant protections (2023+ legislation). Monitor per-deal.
- **Crime:** varies sharply by submarket — neighborhood-level scoring required

## How this maps into the app

Every criterion above becomes one of:

1. **A hard filter** on the deal pipeline (e.g., units < 100 → auto-reject)
2. **A scoring input** (population growth %, crime index percentile → weighted score)
3. **A checklist** on the deal page (value-add levers identified?)
4. **A badge** on the property page (green = passes, amber = borderline, red = fails)

### Provider → criterion matrix

| Criterion | Provider(s) | Status |
|---|---|---|
| Unit count, vintage, assessed value | Denver Assessor (free), ATTOM (paid) | Denver live; ATTOM stubbed |
| Market rents / rent comps | HUD FMR (free), RentCast (paid) | HUD stubbed; RentCast stubbed |
| Population, growth, demographics | US Census ACS | Live |
| Job growth | BLS (free, no key) | **Not yet implemented — add in next phase** |
| Crime | FBI UCR / local feeds | **Not yet implemented — add in next phase** |
| Landlord friendliness | Static state+city lookup table | **Not yet implemented — add in next phase** |

## Output: the "Buy Box" card

On every property page, show a single **Buy Box** summary:

- ✅ / ❌ per criterion
- Overall score 0–100
- "Why pass" short list if fails
- "Why pursue" short list if passes + which value-add levers are plausible
