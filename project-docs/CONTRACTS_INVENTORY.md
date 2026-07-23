# Contracts Inventory — Land Wholesaling ("Empty Lots")

**Status:** Findings only. Nothing in the live templates has been changed. This document defines the *complete* document set the land-wholesaling business needs, so the team and the reviewing attorneys can see what we have, what we are missing, and what is essential vs. optional in each live market.

**Live markets (verified in code):** Florida — Hillsborough County / Tampa; North Carolina — Wake County / Raleigh. Both carry `landSupported: true` in [`apps/api/src/config/markets.ts`](apps/api/src/config/markets.ts). All other MSAs are `landSupported: false`, so this review is scoped to **FL + NC only**.

> ⚠️ **This is a product/legal-completeness review by a non-lawyer.** Every "essential/optional" call below is a *drafting hypothesis for the attorneys to confirm*, not a legal conclusion. One paid review per state (FL + NC) is required before any of these documents are used on a real deal — see [CONTRACTS_ATTORNEY_PACKET.md](project-docs/CONTRACTS_ATTORNEY_PACKET.md).

---

## What we generate today

Two PDFs, both from [`apps/api/src/landContract.ts`](apps/api/src/landContract.ts), driven by the CRM form [`apps/crm/src/pages/LandContract.tsx`](apps/crm/src/pages/LandContract.tsx) and three pre-written `mailto:` emails in [`apps/crm/src/lib/contractEmail.ts`](apps/crm/src/lib/contractEmail.ts):

1. **Purchase & Sale Agreement** (seller-facing) — `renderLandContractPdf()`
2. **Assignment of Purchase and Sale Agreement** (builder-facing) — `renderAssignmentContractPdf()`

Everything else in the table below is **not generated today**.

---

## The full document set

Legend — **Essential** = a normal, defensible FL/NC wholesale assignment should not close without it (or its function must be covered elsewhere). **Recommended** = materially reduces legal/enforceability risk. **Optional** = situational. **Confirm** = the attorney decides whether it rises to essential in that state.

| # | Document | Purpose | FL | NC | Generate today? |
|---|----------|---------|----|----|-----------------|
| 1 | **Purchase & Sale Agreement (PSA)** | Puts the lot under contract; creates the equitable interest that is the entire asset being wholesaled | Essential | Essential | ✅ Yes |
| 2 | **Assignment of Contract** | Sells the equitable interest (the PSA) to the builder for the assignment fee | Essential | Essential | ✅ Yes |
| 3 | **Memorandum of Contract** | Short recordable notice that clouds title so the seller can't quietly sell out from under us; protects the equitable interest (esp. NC pure-race) | Recommended / Confirm | Recommended / Confirm | ❌ No |
| 4 | **Non-Circumvention / NCND (with builder)** | Stops the builder from going around us to the seller to dodge the fee | Recommended | Recommended | ❌ No |
| 5 | **Notice of Termination (feasibility / title cancellation)** | The written instrument that actually *exercises* the buyer's exit and documents deposit return; our PSA has an exit right but no mechanism to invoke it | Essential | Essential | ❌ No |
| 6 | **Wholesaler / Equitable-Interest Disclosure to Seller** | Written statement that Buyer is a wholesaler holding only an equitable/contractual interest and intends to assign for a profit; anti-fraud + licensing-safety | Recommended / Confirm | Recommended / Confirm | ❌ No |
| 7 | **Seller Property Disclosure or Waiver (vacant land)** | Captures/【or waives】the seller's disclosure of known material defects; anchors the "known facts" language already in PSA clause 2a | Recommended / Confirm | See notes | ❌ No |
| 8 | **Earnest-Money Receipt / Escrow Instructions** | Proof the deposit was delivered and the terms on which the title company holds it; today only prose in the "open escrow" email | Recommended | Recommended | ❌ No (email only) |
| 9 | **Buy-Box Confirmation (builder)** | Records that the lot matches the builder's stated buy box before we assign; commercial protection, not legal | Optional | Optional | ❌ No (referenced in email prose) |
| 10 | **Assignment-fee / closing-statement instruction** | Directs the closing agent how to disburse the fee so it is documented as an assignment fee (tax-characterization matters — see risk register) | Recommended / Confirm | Recommended / Confirm | ❌ No |
| 11 | **Spousal joinder / entity-authority rider** | Gets the non-owner spouse (FL homestead; NC entireties) or the LLC/trust/estate signatory to bind the property | Confirm | Confirm | ❌ No |

Items **10–11** were not in the starting hypothesis but the legal research surfaced them as real gaps; they are folded in here for completeness.

---

## Per-document detail

### 1. Purchase & Sale Agreement — *have*
- **What it does today:** 1-page as-is vacant-land PSA. Buyer signs "Buyer and/or assigns." Feasibility-study exit (N days), clear-title exit, closing agent, earnest money held at closing agent, Buyer pays all closing costs incl. documentary stamps.
- **Essential in both states.** This *is* the asset. Everything downstream (the assignment, the fee) depends on this being a valid, enforceable, assignable contract to convey real property.
- **Known weaknesses** (detailed in [CONTRACTS_CLAUSE_AUDIT.md](project-docs/CONTRACTS_CLAUSE_AUDIT.md) and [CONTRACTS_RISK_REGISTER.md](project-docs/CONTRACTS_RISK_REGISTER.md)): illusory-feasibility risk (undefined "inspection standards" + $0–$100 earnest), blank legal description allowed (statute-of-frauds — *void* in NC / unenforceable in FL), "Buyer pays documentary stamps" contradicts the FL/NC seller-pays-transfer-tax default, no governing law/venue, no default & remedies, no time-is-of-essence, no notices clause, no signatory-capacity/spousal lines.

### 2. Assignment of Contract — *have*
- **What it does today:** Assigns all buyer rights to the builder; fee paid at closing via closing agent; assignee assumes all buyer obligations incl. price + closing costs; closing agent holds everything in escrow; if no closing the assignment is void.
- **Essential in both states.**
- **Known weaknesses:** no non-circumvention, no assignor representation that the PSA is valid/in force/unassigned, no assignee acknowledgment that it has read/received the PSA, no indemnification, no remedy on assignee default, no explicit handling of already-posted earnest money, no consent-to-assign hook (NC standard forms are *anti*-assignment by default — see risk register R-13).

### 3. Memorandum of Contract — *missing*
- **Purpose:** Record a short-form notice in the county land records to give public notice of our equitable interest, so the seller cannot convey to a third party free of our claim.
- **FL:** Recordable under Ch. 695 (notarized; post-1/1/2024 witness-address formatting under § 695.26). **Confirm** whether it rises to essential — many short-fuse wholesale deals skip it to avoid slander-of-title exposure.
- **NC:** More valuable because NC is **pure-race** (Connor Act, G.S. 47-18) — first to record wins even over someone with actual notice. **BUT** the statutory memorandum for a purchase contract (G.S. 47-119.1) **must be signed and notarized by the seller** — we cannot record a conforming memorandum unilaterally. Recording a non-conforming, seller-unsigned "memorandum" is both statutorily deficient and high slander-of-title risk.
- **Design implication:** if we generate this, it must pair with (a) an express contractual right-to-record clause in the PSA and (b) an auto-release/satisfaction-on-termination instrument. See remediation plan.

### 4. Non-Circumvention / NCND with builder — *missing*
- **Purpose:** Prevent the builder (assignee/prospect) from contacting the seller directly and re-cutting the deal to avoid our assignment fee, and protect our seller/lead information.
- **Recommended in both states** — this is commercial protection (contract + trade-secret/UDTP flavor), not a state-formality issue. Most enforceable when signed *before* we disclose the specific property/seller to the builder.

### 5. Notice of Termination — *missing*
- **Purpose:** The written instrument that exercises the buyer's feasibility or clear-title exit and instructs the closing agent on deposit return.
- **Essential in both states.** Our PSA grants an exit but provides **no mechanism to invoke it** — a right with no notice mechanism is a latent dispute. NC's due-diligence model in particular runs on written termination notices within a defined window.

### 6. Wholesaler / Equitable-Interest Disclosure to Seller — *missing*
- **Purpose:** Tell the seller in writing that Buyer is a wholesaler, holds only an equitable/contractual interest, and intends to assign the contract to an end buyer for a profit.
- **FL:** No FL *statute* found that mandates it; **best practice** to reduce fraud/misrepresentation and FDUTPA exposure and to stay clearly inside the "selling my own interest, not brokering the property" licensing lane (Ch. 475). **Confirm.**
- **NC:** No single codified wholesaler-disclosure statute is currently in force (the bill that would have created one, HB 797, **stalled in the Senate and was not enacted** — verify current status). NCREC guidance treats *misrepresenting your ownership interest* as a trigger for unlicensed-activity/deception findings, so affirmative honesty here is effectively required. **Confirm** whether a written form is mandated vs. best practice.

### 7. Seller Property Disclosure or Waiver — *missing*
- **Purpose:** Capture the seller's disclosure of known material defects (or a knowing waiver), backing PSA clause 2a's "Seller will make the Buyer aware of any known facts."
- **FL:** *Johnson v. Davis* imposes a duty to disclose known, material, non-obvious defects for **residential** property; FL courts have **declined to extend it to commercial/undeveloped land**, and **vacant-land application is unsettled**. **Confirm per parcel.**
- **NC:** The Residential Property Disclosure Act (G.S. 47E) **does not apply to vacant land** (no dwelling unit), so no statutory RPOADS/MOG statement is required. NC REALTORS' own Form 12-T pairs with a *Vacant Land Disclosure* (Form 142) by practice, but that is form-ecosystem practice, not statute. **Confirm.**

### 8. Earnest-Money Receipt / Escrow Instructions — *missing (email only)*
- **Purpose:** Documentary proof the deposit was delivered and the exact terms on which the neutral title company holds/releases it. Today this lives only as prose in `titleCompanyEmail()`.
- **Recommended in both states.** In FL, if a *broker* ever holds the deposit, FREC escrow timing/trust rules (Fla. Stat. § 475.25; FAC 61J2-14) attach; with a title/escrow agent, the escrow terms govern — so they should be written. An **unlicensed principal (the wholesaler) generally should not hold another party's deposit** in either state; NCREC flags a wholesaler handling third-party deposits as an unlicensed-brokerage red flag.

### 9. Buy-Box Confirmation — *missing (email prose only)*
- **Purpose:** Record that the lot matches the builder's stated buy box (acreage, zip, utilities, zoning) before assigning. Commercial documentation; reduces "this doesn't fit my box" walk-aways after assignment.
- **Optional** in both states — no legal weight, purely deal-hygiene.

### 10. Assignment-fee disbursement instruction — *missing*
- **Purpose:** Instruct the closing agent to disburse the fee explicitly *as an assignment fee* on the settlement statement. **Why it matters:** how the fee is characterized on the closing statement affects the transfer-tax base question flagged in the risk register (FL doc-stamp/equitable-interest risk; NC excise base on assignment vs. double-close). **Confirm** with each state's attorney/title company.

### 11. Spousal joinder / entity-authority rider — *missing*
- **Purpose:** Bind the property when the signer isn't the whole ownership: **FL** homestead requires spousal joinder to alienate (vacant land is usually *not* homestead, but confirm it isn't contiguous to the residence); **NC** tenancy-by-the-entirety requires *both* spouses to convey, and solely-titled property still needs the spouse to join the deed (or a recorded free-trader agreement) to clear marital rights. Entity sellers (LLC/trust/estate) need the correct authorized signatory. **Confirm.**

---

## Summary: gap count

- **Generated today:** 2 of 11 (PSA, Assignment).
- **Essential and missing:** Notice of Termination (#5). Arguably Memorandum (#3) in NC and spousal/entity rider (#11) depending on the parcel — attorney to grade.
- **Recommended and missing:** Non-circumvention (#4), wholesaler disclosure (#6), earnest-money receipt/escrow instructions (#8), fee-disbursement instruction (#10), and seller disclosure/waiver (#7) subject to per-parcel analysis.
- **Optional and missing:** Buy-box confirmation (#9).

Next: the clause-level audit of the two documents we *do* have — [CONTRACTS_CLAUSE_AUDIT.md](project-docs/CONTRACTS_CLAUSE_AUDIT.md).
