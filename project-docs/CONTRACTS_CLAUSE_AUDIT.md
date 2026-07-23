# Contracts Clause Audit — PSA + Assignment

**Status:** Findings only; the live templates in [`apps/api/src/landContract.ts`](apps/api/src/landContract.ts) are unchanged.

A clause-by-clause checklist for a real-estate Purchase & Sale Agreement plus an Assignment of Contract, benchmarked against the standard reference forms for each live market:
- **FL** — Florida Realtors/Florida Bar "AS IS" Residential Contract (ASIS-7x) and the Florida Realtors **Vacant Land Contract (VAC)**.
- **NC** — NC Bar Assoc. / NC Assoc. of REALTORS **Offer to Purchase and Contract — Vacant Lot/Land (Form 12-T)**.

We benchmark clause *categories* only (the reference forms are copyrighted). Each row is graded against our template:

- **Present** — the template covers it adequately.
- **Weak** — present but under-specified, ambiguous, or legally risky as written.
- **Missing** — absent.

> Non-lawyer review. Grades are drafting judgments for the attorneys to confirm. Severity of the highest-risk items is carried into [CONTRACTS_RISK_REGISTER.md](project-docs/CONTRACTS_RISK_REGISTER.md).

---

## Part A — Purchase & Sale Agreement (`renderLandContractPdf`)

| # | Clause category | Grade | Specific gap / note |
|---|-----------------|-------|---------------------|
| 1 | **Parties (legal names, entity vs. individual)** | Weak | Free-text `sellerNames` / `buyerName` only. No entity-vs-individual handling, no signatory-capacity ("as Manager of…"), no spousal identification. See #24–25. |
| 2 | **Property description (legal description + parcel ID)** | Weak | `legalDescription` is **optional and renders as a blank underline** when empty ([landContract.ts:48](apps/api/src/landContract.ts), `fieldLine`). A blank/inadequate description is a statute-of-frauds defect — **void in NC** (patent ambiguity, *Kidd v. Early*), **unenforceable in FL**. Address/parcel alone may or may not save it. **This is the single most dangerous data-entry gap.** |
| 3 | **Purchase price** | Present | Clause 1. Rendered via `fmtMoney`. Fine. |
| 4 | **Earnest money / escrow deposit** | Weak | Clause 3 holds earnest at the closing agent, but the amount defaults to **$0** server-side ([land.ts:22](apps/api/src/routes/land.ts)) and the CRM pre-fills **$100** ([LandContract.tsx:42](apps/crm/src/pages/LandContract.tsx)). Combined with the free-look exit, this drives the illusory-contract risk. No delivery deadline, no escrow-agent duties/interpleader clause. |
| 5 | **Independent / due-diligence consideration** | Missing | Nothing flows to the seller for the free-look right. NC's whole model is a **non-refundable Due Diligence Fee paid to the seller** as the consideration that makes the walk-away right non-illusory. We have no equivalent. Core enforceability gap. |
| 6 | **Financing terms / cash confirmation** | Missing | No statement that this is a cash purchase (wholesale deals are cash). Minor, but reference forms always state it. |
| 7 | **Inspection / feasibility / due-diligence period + termination right** | Weak | Clause 2b grants a feasibility period of `feasibilityDays`, but the trigger is **"does not pass inspection standards"** — *"inspection standards" is undefined*. Reference forms give a **sole-discretion, any-reason** cancellation. As written, ours is a conditional exit tied to an undefined standard, which is both narrower and vaguer than a clean free-look — and arguably illusory. |
| 8 | **Land-specific investigations (zoning, plat, soil/perc, environmental, access, utilities)** | Missing | The VAC form enumerates these as the feasibility scope. Ours says only "inspection standards." No mention of access/utilities/zoning — material for raw lots. |
| 9 | **Title evidence, marketable title, permitted exceptions, cure period** | Weak | Clause 2c gives the buyer an out if "Seller cannot provide a clear title," but there's no title-evidence delivery, no *definition* of marketable title, no permitted exceptions, no seller cure period. |
| 10 | **Survey right / encroachments** | Missing | No survey right or treatment of encroachments. |
| 11 | **Legal access (ingress/egress)** | Missing | Not addressed; critical for landlocked lots. |
| 12 | **Seller representations & warranties** | Weak | Only clause 2a ("known facts that affect value"). No rep of authority to sell, no rep that seller owns the property, no rep re: liens/leases/litigation/no other contracts. |
| 13 | **Required disclosures** | Missing | No disclosure framework; leans entirely on 2a. FL *Johnson v. Davis* / NC vacant-land practice not addressed. |
| 14 | **Deed / conveyance instrument type** | Missing | Doesn't specify warranty vs. special-warranty deed to be delivered at closing. |
| 15 | **Closing / settlement date + extension** | Weak | Optional `closingDate` ("on or before"). No extension mechanism, no NC settlement-vs-closing distinction. |
| 16 | **Possession** | Missing | Not addressed (low stakes for vacant land, but reference forms include it). |
| 17 | **Closing-cost allocation** | Weak | Clause 4: "Buyer to pay all title-related charges, closing fees, recording fees, and documentary stamps." Buyer paying its own closing costs is normal for wholesale; but see #18. |
| 18 | **Transfer-tax allocation** | **Weak (likely wrong)** | Clause 4 assigns **documentary stamps to the Buyer**. In **FL the seller pays deed doc stamps by default** ($0.70/$100); in **NC the seller pays the excise tax by default** ($2/$1,000). Making the buyer pay contradicts both states' reference-form defaults. Either an intentional negotiated deviation (make it conspicuous) or an error. Also: on the deed, "buyer pays" is atypical and may confuse the closing agent about who's charged. |
| 19 | **Prorations (taxes, assessments, dues)** | Missing | No proration of ad valorem taxes/assessments to closing. Standard in every reference form. |
| 20 | **Risk of loss / casualty / condemnation** | Missing | Not addressed. |
| 21 | **Default & remedies (buyer vs. seller; liquidated damages)** | Missing | No default clause at all — no seller-default remedy (specific performance?), no buyer-default consequence, no liquidated-damages/deposit-forfeiture treatment. Major gap. |
| 22 | **Dispute resolution (mediation/arbitration)** | Missing | None. |
| 23 | **Attorney's fees to prevailing party** | Missing | None. |
| 24 | **Governing law & venue** | Missing | No choice of law/venue — matters across two states with different rules (FL vs. NC). |
| 25 | **Notices (method, addresses, e-delivery)** | Missing | No notices clause — and there's no way to serve the (also missing) termination notice. |
| 26 | **Time is of the essence + computation of time** | Missing | Feasibility period runs "from the effective date" but no time-is-of-essence and no day-counting convention (business vs. calendar; end-of-day). |
| 27 | **Assignment clause (express)** | Weak | Relies solely on **"Buyer and/or assigns"** in the party line. "And/or assigns" is *not* an operative assignment clause — reference forms have a dedicated assignability paragraph, and the **NC standard form is anti-assignment by default** (needs written consent of all parties). An explicit assignment-permitted clause (and, if needed, seller consent) should be in the body. |
| 28 | **Signatory capacity — entity/trust/estate; FL spousal joinder; NC entireties** | Missing | Signature block is a bare "Signature ___ Date ___" with the name label ([landContract.ts:228](apps/api/src/landContract.ts) `sig`). No capacity line, no second-spouse line, no entity-authority line, no witness/notary lines. FL deeds need 2 witnesses + notary + (post-1/1/2024) witness addresses; the *contract* generally doesn't, but signatory capacity still matters for validity. |
| 29 | **E-sign / counterparts** | Missing | No counterparts or e-signature consent clause. E-signed contracts are valid under ESIGN/UETA in both states **only if the parties agreed to transact electronically** — a consent clause captures that. |
| 30 | **Entire agreement / integration** | Missing | No integration clause. `specialTerms` free-text is the only extensibility. |
| 31 | **Right to record a memorandum + auto-release on termination** | Missing | If we ever record a Memorandum (see inventory #3), we need an express contractual right to record it and a self-executing release on termination to limit slander-of-title exposure. |
| 32 | **FIRPTA / foreign-seller withholding** | Missing | FL forms include FIRPTA compliance. Relevant if a seller is a foreign person. |

**PSA scorecard:** Present **2**, Weak **9**, Missing **21** (of 32 checked). The two "Present" are price and the escrow-holding concept; almost everything a reference vacant-land form treats as standard is missing or weak.

---

## Part B — Assignment of Contract (`renderAssignmentContractPdf`)

| # | Clause category | Grade | Specific gap / note |
|---|-----------------|-------|---------------------|
| A1 | **Identification of the original PSA** | Present | Clause preamble references the PSA by date, parties, and property. Good. |
| A2 | **Assignor / assignee identification** | Weak | Free text; same entity/capacity gaps as the PSA (#28). |
| A3 | **Assignment fee + timing/mechanics** | Present | Clause 1: fee due at closing, disbursed by closing agent from proceeds. Clear. |
| A4 | **Assignee assumption of buyer obligations** | Present | Clause 2: assignee assumes all buyer obligations incl. price + closing costs. Good. |
| A5 | **Escrow of documents & deposits** | Present | Clause 3: closing agent holds PSA + assignment + deposits in escrow. Good. |
| A6 | **Void-if-no-closing** | Present | Clause 4: if no closing, assignment is void; deposits returned per PSA. Reasonable. |
| A7 | **Assignor representation that the PSA is valid, in force, and unassigned** | Missing | The assignee has no assurance the underlying contract actually exists, is enforceable, hasn't been terminated, and hasn't already been assigned elsewhere. Standard and important. |
| A8 | **Assignee acknowledgment of receipt/review of the PSA** | Missing | No clause stating the assignee has received and read the PSA and takes subject to its terms. Without it, "assumes all obligations" is to a document the assignee may never have seen. |
| A9 | **Non-circumvention** | Missing | Nothing stops the assignee from going directly to the seller to avoid the fee. Core wholesaler protection. |
| A10 | **Indemnification** | Missing | No indemnity from assignee for post-assignment performance, or mutual indemnity. |
| A11 | **Remedy on assignee default** | Missing | Clause 4 voids the assignment if *no closing* happens, but there is **no remedy if the assignee breaches** (e.g., fails to close when able) — no forfeiture, no damages, no recovery of the lost fee. |
| A12 | **Handling of already-posted earnest money** | Weak | Clause 3 references "deposits" generically and clause 4 says returned "per the Agreement," but there's no explicit statement of *who posted what* and whether the assignor's earnest money is credited/refunded/assumed by the assignee. If the assignor already funded earnest money, its disposition on assignment is undefined. |
| A13 | **Seller consent / notice of assignment** | Missing | No seller acknowledgment of the assignment. In NC the standard PSA is anti-assignment without all-party consent — the assignment could be ineffective against the seller without it. |
| A14 | **Governing law & venue** | Missing | Same cross-state issue as PSA #24. |
| A15 | **Notices** | Missing | No notices clause. |
| A16 | **Entire agreement / counterparts / e-sign** | Missing | None. |
| A17 | **Transfer-tax / fee-characterization note** | Missing | No language directing that the fee be documented as an assignment fee on the settlement statement (matters for the FL doc-stamp / NC excise base questions — risk register R-5/R-6). |

**Assignment scorecard:** Present **5**, Weak **2**, Missing **10** (of 17 checked). The core economic mechanics (fee, assumption, escrow, void-if-no-close) are actually decent; the gaps are the *protective* clauses (assignor reps, assignee acknowledgment, non-circumvention, default remedy, indemnity, seller consent).

---

## The known-issue confirmations requested

The task called out specific suspected problems. Confirmed against the code and research:

1. **Illusory/consideration risk from the feasibility clause** — **Confirmed.** "Inspection standards" is undefined (clause 2b) and earnest money is $0–$100 with nothing flowing to the seller. Both states let mutual promises supply consideration *in principle*, but a broad buyer exit with no consideration to the seller invites an illusory-promise / lack-of-mutuality attack. If the PSA is illusory, the **assignment built on it collapses too**. NC's reference model specifically cures this with a non-refundable fee to the seller. → R-1 in risk register.
2. **No termination mechanism/notice** — **Confirmed.** Exit rights exist (2b, 2c) with no instrument to invoke them and no notices clause. → Inventory #5, R-3.
3. **No default & remedies** — **Confirmed** (PSA #21, Assignment A11).
4. **No explicit assignment clause (relies on "and/or assigns")** — **Confirmed** (#27); compounded by NC anti-assignment default (A13/R-13).
5. **No time-is-of-essence, tax proration, governing law/venue, notices, counterparts/e-sign, seller reps, signatory capacity, FL spousal joinder** — **All confirmed missing** (#12, #19, #24, #25, #26, #28, #29).
6. **Legal description can be blank (statute of frauds)** — **Confirmed** (#2); void in NC / unenforceable in FL. → R-2 (highest severity).
7. **"Buyer pays doc stamps" may be wrong for FL** — **Confirmed** (#18); contrary to FL *and* NC seller-pays defaults. → R-7.
8. **Assignment gaps** (no non-circumvention, no assignor validity rep, no assignee acknowledgment, no indemnification, no assignee-default remedy, no handling of posted earnest money) — **All confirmed** (A7, A8, A9, A10, A11, A12).

Proceed to severity-ranked risks with citations: [CONTRACTS_RISK_REGISTER.md](project-docs/CONTRACTS_RISK_REGISTER.md).
