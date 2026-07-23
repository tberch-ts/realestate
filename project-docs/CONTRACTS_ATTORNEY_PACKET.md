# Attorney Review Packet — Land Wholesaling Contracts (FL + NC)

**Purpose:** A self-contained packet to hand to **one licensed Florida real-estate attorney** and **one licensed North Carolina real-estate attorney**. It contains (1) the two contract templates we generate today, rendered to plain text; (2) a redline of the clause additions we propose; and (3) a targeted question list per state.

> **We are not lawyers.** This packet is a product/completeness review by the engineering/product team. **One paid review per state (FL and NC) is required before these templates are used on any real transaction.** The templates already carry a "TEMPLATE ONLY — NOT LEGAL ADVICE" footer; the goal of this work is to make them *defensible enough to be worth an attorney's time*, not to replace the attorney. Please treat every proposed change below as a **draft proposal to accept, reject, or rewrite.**

**Live markets:** FL — Hillsborough County / Tampa. NC — Wake County / Raleigh.
**Source of truth:** [`apps/api/src/landContract.ts`](apps/api/src/landContract.ts) (generators), [`packages/shared/src/index.ts`](packages/shared/src/index.ts) (input types).

---

## Part 1 — The two templates as they render today

Rendered with representative values: Buyer *Acme Land LLC*, Seller *Jane Doe and John Doe*, price *$60,000*, feasibility *30 days*, earnest *$100*, closing agent *ABC Title LLC*, **legal description left blank** (to show the blank-field behavior). Bracketed italics are field substitutions.

### 1A. PURCHASE AND SALE AGREEMENT

> **PURCHASE AND SALE AGREEMENT**
> Effective date: *[July 23, 2026]*
>
> Acme Land LLC, Buyer and/or assigns ("Buyer"), agrees to purchase, and/or assign from Seller(s): Jane Doe and John Doe ("Seller"), the following described real estate, together with all improvements thereon and all appurtenant rights, located at:
>
> **Address:** *123 Vacant Lot Rd, Tampa, FL*
> **Parcel ID:** *U-01-23-45-6789*
> **Legal Description:** ________________________________________________  ← *renders blank when not entered*
>
> **Seller agrees:**
>
> 1. The purchase price is to be $60,000.
> 2. The conditions of this Purchase are as follows:
>    a. Property is sold in "AS-IS CONDITION" with no warranties made by the Seller. Seller will make the Buyer aware of any known facts that affect the value of the property.
>    b. If the property does not pass inspection standards during the feasibility study period, or upon any unknown defaults, the Buyer shall be released from any further obligation under this contract. The feasibility study will continue for a period of 30 days from the effective date.
>    c. If Seller cannot provide a clear title, or does not allow a feasibility study, Buyer will be released from any further obligation under this contract.
>    d. Closing Agent: ABC Title LLC, located at *[address]*. Closing on or before *[date]*.
> 3. In consideration of the sum of $100, Earnest Money will be deposited by Buyer and held at the Closing Agent's office.
> 4. Buyer to pay all title-related charges, closing fees, recording fees, and documentary stamps.
> *[5. Special terms: … — only if provided]*
>
> **Seller:** Jane Doe and John Doe
> Signature: ____________________  Date: __________
>
> **Buyer:** Acme Land LLC, Buyer and/or assigns
> Signature: ____________________  Date: __________
>
> *TEMPLATE ONLY — NOT LEGAL ADVICE. Real-estate contract requirements vary by state. Have a licensed local real-estate attorney review this document before use.*

### 1B. ASSIGNMENT OF PURCHASE AND SALE AGREEMENT

> **ASSIGNMENT OF PURCHASE AND SALE AGREEMENT**
> Effective date: *[July 23, 2026]*
>
> Acme Land LLC ("Assignor") hereby assigns and transfers to Coastal Homes LLC ("Assignee") all of Assignor's rights, title, and interest as Buyer under that certain Purchase and Sale Agreement dated *[July 23, 2026]* between Assignor, as Buyer and/or assigns, and Jane Doe and John Doe, as Seller ("the Agreement"), for the real estate located at:
>
> **Address:** *123 Vacant Lot Rd, Tampa, FL*
> **Parcel ID:** *U-01-23-45-6789*
> **Legal Description:** ________________________________________________
>
> **The parties agree:**
>
> 1. Assignee shall pay Assignor an assignment fee of $10,000, due and payable at closing, disbursed by the Closing Agent from closing proceeds.
> 2. Assignee assumes and agrees to perform all of Buyer's obligations under the Agreement, including payment of the $60,000 purchase price to Seller and all title-related charges, closing fees, recording fees, and documentary stamps.
> 3. Closing shall be conducted by ABC Title LLC, located at *[address]* ("Closing Agent"), who shall hold the Agreement, this Assignment, and all deposits in escrow and administer all disbursements. Closing on or before *[date]*.
> 4. If closing does not occur under the terms of the Agreement, this Assignment is void and neither party shall have any further obligation to the other, except return of any deposits per the Agreement.
> *[5. Special terms: … — only if provided]*
>
> **Assignor:** Acme Land LLC
> Signature: ____________________  Date: __________
>
> **Assignee:** Coastal Homes LLC
> Signature: ____________________  Date: __________
>
> *TEMPLATE ONLY — NOT LEGAL ADVICE. …*

---

## Part 2 — Proposed redline (draft additions for your review)

Notation: **[+ ADD]** new clause, **[~ CHANGE]** modify existing, **[FL]/[NC]** state-specific variant. These are our *proposals*; please correct.

### PSA redline

- **[~ CHANGE] Property description (clause header block).** Do **not** allow a blank legal description. Require, at minimum, county parcel ID **and** street address, and prefer inserting the recorded legal description. *Rationale: statute of frauds — void in NC (patent ambiguity), unenforceable in FL. See R-2.*
  - **[NC]** Consider language tying the description to the recorded source (e.g., "being the same property described in Deed Book __, Page __, Wake County Registry") so any ambiguity is **latent** (curable) rather than **patent** (void).

- **[~ CHANGE] Clause 2b (feasibility).** Replace "does not pass inspection standards … or upon any unknown defaults" with a **sole-discretion, any-reason** cancellation right exercisable by **written notice** before the end of a defined Feasibility/Due-Diligence Period, and **define the period's day-count** (calendar days from Effective Date, ending 11:59 pm local). *Rationale: "inspection standards" is undefined and arguably illusory. See R-1, R-3.*
  - **[+ ADD] [NC]** A **non-refundable Due Diligence Fee** paid **to the Seller** as independent consideration for the free-look right (NC's model that defeats an illusoriness attack). Attorney to set a defensible minimum.
  - **[+ ADD] [FL]** Retain a **consideration recital** ("$10 and other good and valuable consideration, the receipt of which is acknowledged") and confirm whether a nominal independent consideration is advisable given the broad buyer exit.

- **[~ CHANGE] Clause 3 (earnest money).** Add a **delivery deadline** ("within __ business days of Effective Date"), name the **escrow holder** and its duties, and add an **interpleader/indemnity** for the escrow agent. Confirm the minimum earnest amount; discourage $0.

- **[+ ADD] Notice of Termination mechanism + Notices clause.** Method (email/e-sign acceptable), addresses, deadline, and deposit-return instruction. *Enables the exits in 2b/2c to actually be exercised. See R-3, R-14.*

- **[~ CHANGE] Clause 4 (costs / transfer tax).** **Split** ordinary closing costs from transfer tax. **[FL]** default **deed documentary stamps to the Seller** (FL norm) unless deliberately negotiated otherwise (make any deviation conspicuous). **[NC]** default **excise tax to the Seller** (NC norm). *See R-7.*

- **[+ ADD] Seller representations & warranties.** Authority to sell; ownership; no undisclosed liens/leases/litigation/other contracts; (FL) marital/homestead status; (NC) marital status & title-holding form.

- **[+ ADD] Assignment-permitted clause (body, not just party line).** Explicit right to assign. **[NC]** If any standard NC form is used, **strike its anti-assignment provision** or obtain **written seller consent** — "and/or assigns" does not override it. *See R-13.*

- **[+ ADD] Signatory/authority block.** Entity signatory capacity ("By: ___, its Manager"); **[FL]** spousal-joinder line + homestead determination; **[NC]** both-spouses line for entireties + free-trader/spousal-release path for solely-titled property. *See R-8.*

- **[+ ADD] Standard clause block:** default & remedies (seller vs. buyer; deposit as liquidated damages; specific-performance availability); time is of the essence; tax/assessment prorations to closing; deed type to be delivered; risk of loss/condemnation; dispute resolution (mediation-first); attorney's fees to prevailing party; governing law & venue (**[FL]** Florida / Hillsborough; **[NC]** North Carolina / Wake); integration; **counterparts & e-signature consent** (UETA agreement to transact electronically). *See R-14, R-9.*

- **[+ ADD] (optional) Right to record a Memorandum + auto-release on termination**, only if we decide to record. *See R-15.*

### Assignment redline

- **[+ ADD] Assignor representations:** the PSA is valid, in full force, not terminated, not previously assigned, and Assignor has authority to assign. *A7.*
- **[+ ADD] Assignee acknowledgment:** Assignee has **received and reviewed** the PSA and takes subject to its terms. *A8.*
- **[+ ADD] Non-circumvention:** Assignee will not contact/transact with the Seller to acquire the property outside this Assignment for a defined period; remedy on breach. (Or a standalone NCND signed before disclosure.) *A9, inventory #4.*
- **[+ ADD] Indemnification** (assignee indemnifies assignor for post-assignment performance).
- **[+ ADD] Remedy on assignee default** (fee still owed / liquidated damages if assignee breaches when able to close) — distinct from the existing "void if no closing." *A11.*
- **[~ CHANGE] Earnest-money handling:** state explicitly who posted earnest money and its disposition (credited to assignee at closing, or refunded to assignor) rather than only "per the Agreement." *A12.*
- **[+ ADD] Seller consent / acknowledgment of assignment** (esp. NC). *A13.*
- **[+ ADD] Fee-characterization language** directing the closing agent to reflect the payment **as an assignment fee** on the settlement statement (tax base — R-5/R-6).
- **[+ ADD] Governing law/venue, notices, counterparts/e-sign.**

---

## Part 3 — Question list for the reviewing attorneys

### Questions for BOTH attorneys (ask the FL one about FL, the NC one about NC)
1. Is our **feasibility/free-look clause enforceable**, or illusory given the undefined "inspection standards" and $0–$100 earnest with nothing flowing to the seller? What minimum consideration structure makes it solid in your state? *(R-1)*
2. What is the **minimum legal description** you require to satisfy the statute of frauds? Is street address + parcel ID enough, or do you require the recorded legal description? *(R-2)*
3. Where exactly is the **unlicensed-brokerage line** for our marketing/email flow (we assign our own contract; we do not list the property)? Please review our seller/builder/title email copy in [`apps/crm/src/lib/contractEmail.ts`](apps/crm/src/lib/contractEmail.ts). *(R-4)*
4. Is a **written wholesaler / equitable-interest disclosure to the seller** required or merely advisable in your state? Will you provide preferred language? *(R-11)*
5. Who should **hold earnest money**, and are there terms we must put in **written escrow instructions**? Any problem with the wholesaler never touching deposits? *(R-10)*
6. What **default/remedy, governing-law, notice, proration, and dispute-resolution** clauses do you consider mandatory for a defensible one-page (or expanded) contract? *(R-14)*
7. Does an **e-signed** contract/assignment hold up, and what consent language do you want to satisfy UETA? *(R-9)*
8. Please review the **Assignment** for the protective clauses we propose (assignor validity rep, assignee acknowledgment, non-circumvention, indemnity, assignee-default remedy, seller consent). *(R-16, R-13)*
9. Should we ever **record a Memorandum of Contract**? If so, what contents/formalities, and how do we avoid slander-of-title exposure (right-to-record + auto-release)? *(R-15)*
10. Assignment vs. **double-close** — which do you recommend for our fact pattern, and how does the choice change transfer-tax exposure?

### Florida-specific
- **F1.** Does Florida impose **documentary stamp tax on the assignment of an ordinary purchase contract or on the assignment fee** (equitable-conversion theory under § 201.02; contrast FAC 12B-4.013 agreement-for-deed)? Should we request a **DOR Technical Assistance Advisement** before treating the fee as untaxed? *(R-5)*
- **F2.** Confirm the **deed doc-stamp default is the Seller** and advise on our clause 4 (currently "Buyer pays … documentary stamps"). *(R-7)*
- **F3.** For a **vacant lot**, does *Johnson v. Davis* impose any seller disclosure duty, or does caveat emptor govern? How does that interact with our as-is clause 2a? *(R-12)*
- **F4.** **Homestead/spousal joinder:** how do we confirm a vacant lot is not homestead, and when must the **spouse join the contract and deed**? What happens to a one-spouse contract on homestead? *(R-8)*
- **F5.** Confirm **no 2023–2026 FL statute or FREC rule** specifically regulates wholesaling / equitable-interest marketing. *(R-4)*
- **F6.** Deed **witness/notary** and the **§ 695.26** (eff. 1/1/2024) witness-address rule — anything we must build into the eventual deed / any recorded memorandum? *(R-9)*

### North Carolina-specific
- **NC1.** **Confirm HB 797 (wholesaler licensing/disclosure) status** — enacted or not? Does current law require a license or a mandatory right-to-cancel disclosure for our activity? *(R-4, R-11)*
- **NC2.** How is **excise tax** computed on a **straight assignment** (base = seller's price or price + fee?), and does a **double-close incur it twice**? How should the assignment fee appear on the settlement statement? Confirm **Wake County has no local land-transfer tax**. *(R-6)*
- **NC3.** The **standard NC form is anti-assignment.** How do we make our deals cleanly assignable — strike the clause, obtain written seller consent, or use a specific assignable contract? *(R-13)*
- **NC4.** **Marital interest:** entireties requires both spouses; for solely-titled property, do you require **spousal joinder or a recorded free-trader agreement** for marketable title? Does the spouse need to sign the **contract**? *(R-8)*
- **NC5.** **Memorandum under G.S. 47-119.1** requires the **seller's** signature/notarization — is recording advisable given pure-race priority vs. slander-of-title risk, and what's the safe process? *(R-15)*
- **NC6.** Does the **vacant-land** deal need any disclosure given **G.S. 47E doesn't apply**? Is a Vacant Land Disclosure advisable anyway? *(R-12)*

---

## Engagement note
Please confirm scope: a **one-time paid review per state** of (a) the PSA, (b) the Assignment, and (c) the marketing/email copy, resulting in redlined, state-specific templates we can implement. We will implement your redlines as FL and NC variants (see [CONTRACTS_REMEDIATION_PLAN.md](project-docs/CONTRACTS_REMEDIATION_PLAN.md)). We are not seeking ongoing representation at this stage unless you recommend it.
