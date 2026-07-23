# Contracts Risk Register — Land Wholesaling (FL + NC)

**Status:** Findings only; live templates unchanged.

Enforceability and compliance risks in the two shipped contracts and the surrounding wholesale flow, ranked by severity, resolved separately for **Florida (Hillsborough/Tampa)** and **North Carolina (Wake/Raleigh)** with source citations.

> ⚠️ **Non-lawyer analysis.** Citations were gathered from primary sources (state statutes, DOR/Commission guidance) and reputable practitioner commentary and are current as of **July 2026**. Statutory subsection numbers drift; every "ATTORNEY TO CONFIRM" flag marks a point that must be verified by a licensed attorney in that state before real use. This register is an input to that review, not a substitute for it.

**Severity scale:** 🔴 **Critical** (can void/defeat the deal, criminal/licensing exposure, or tax surprise) · 🟠 **High** (materially weakens enforceability or invites litigation) · 🟡 **Medium** (should fix; limited blast radius) · 🟢 **Low** (polish).

---

## Risk summary table

| ID | Risk | FL | NC | Where |
|----|------|----|----|-------|
| R-1 | Illusory / lack-of-consideration PSA (undefined "inspection standards" + $0–$100 earnest, broad exit) — and it voids the assignment too | 🟠 High | 🔴 Critical | PSA 2b, 3 |
| R-2 | Blank/inadequate legal description → statute of frauds | 🟠 High | 🔴 Critical | PSA property block |
| R-3 | No termination mechanism / notice for the feasibility & title exits | 🟠 High | 🟠 High | PSA 2b/2c |
| R-4 | Unlicensed-brokerage exposure (marketing the property vs. the contract interest) | 🔴 Critical | 🔴 Critical | Whole flow |
| R-5 | FL documentary-stamp tax on the assignment / assignment fee (equitable-interest theory) | 🔴 Critical | — | Assignment fee |
| R-6 | NC excise-tax base & assignment-vs-double-close exposure | — | 🟠 High | Assignment / closing |
| R-7 | "Buyer pays documentary stamps" contradicts FL/NC seller-pays default | 🟡 Medium | 🟡 Medium | PSA 4 |
| R-8 | Homestead / spousal joinder not captured (FL); entireties/marital interest (NC) | 🟠 High | 🟠 High | Signatures |
| R-9 | Witness / notary / e-signature formalities | 🟡 Medium | 🟡 Medium | Execution |
| R-10 | Earnest-money handling by an unlicensed principal; escrow terms only in email | 🟠 High | 🟠 High | Escrow flow |
| R-11 | No wholesaler / equitable-interest disclosure to seller | 🟡 Medium | 🟠 High | Seller docs |
| R-12 | Seller-disclosure duty for vacant land (Johnson v. Davis / NC 47E scope) | 🟡 Medium | 🟢 Low | PSA 2a |
| R-13 | Assignment relies on "and/or assigns"; NC standard form is anti-assignment | 🟡 Medium | 🟠 High | Assignment |
| R-14 | No default & remedies, governing law/venue, notices, TOE, prorations | 🟠 High | 🟠 High | Both docs |
| R-15 | Memorandum-of-contract recording risk (slander of title; NC needs seller signature) | 🟡 Medium | 🟠 High | Memorandum (future) |
| R-16 | Assignment lacks assignor validity rep, assignee acknowledgment, non-circumvention, indemnity, default remedy | 🟠 High | 🟠 High | Assignment |

---

## R-1 — Illusory / lack-of-consideration PSA 🟠 FL / 🔴 NC
**What:** PSA clause 2b lets the buyer walk if the property "does not pass inspection standards" (undefined) during the feasibility period; earnest money defaults to $0 ([land.ts:22](apps/api/src/routes/land.ts)) / $100 ([LandContract.tsx:42](apps/crm/src/pages/LandContract.tsx)); nothing flows to the seller for the free-look. A broad, buyer-controlled exit with no consideration to the seller can be attacked as an **illusory promise / lack of mutuality**. **If the PSA is unenforceable, the assignment built on it is worthless.**
**FL:** Mutual promises (pay vs. convey) generally supply consideration, so $0 earnest is *not automatically* fatal — but a free-look with undefined standards raises illusoriness risk; the "$10 and other good and valuable consideration" recital is the standard cure and is absent. ATTORNEY TO CONFIRM on the specific form.
**NC:** Higher risk. NC's own reference model (Form 12-T) deliberately requires a **non-refundable Due Diligence Fee paid to the seller** precisely so the free-look right is supported by real consideration. Our template has no equivalent, so the illusory-contract attack is materially stronger. NCREC also treats "no intent to actually purchase" as a red flag (feeds R-4).
**Fix:** Define the cancellation right as a clean sole-discretion right; add a real (even small) non-refundable independent consideration / DD fee to the seller; keep a consideration recital. See remediation R-1.
**Sources:** NC due-diligence model — https://www.ncrealtors.org/question/is-there-a-contract-if-the-earnest-money-deposit-or-due-diligence-fee-hasnt-been-delivered/ ; NCREC DD fee — https://bulletins.ncrec.gov/due-diligence-fees-when-are-they-refunded/ ; FL consideration/deposit — https://berlinpatten.com/know-your-contract/

## R-2 — Blank / inadequate legal description 🟠 FL / 🔴 NC
**What:** `legalDescription` is optional and renders as a blank underline when empty ([landContract.ts:48](apps/api/src/landContract.ts)). Real-estate contracts must identify the land with sufficient certainty (statute of frauds).
**FL (Fla. Stat. § 725.01):** Property must be described with **reasonable certainty**; parol evidence cannot supply a missing essential term. A blank description makes the contract **unenforceable**. An unambiguous street address/parcel *may* suffice, fact-dependent.
**NC (G.S. 22-2; *Kidd v. Early*, 289 N.C. 343 (1976)):** A **patent ambiguity** (description referring to nothing extrinsic) is **VOID** with no parol cure; a **latent ambiguity** (refers to an extrinsic source, e.g., "per recorded deed / PIN") can be cured by extrinsic evidence. A truly blank field is a patent ambiguity → **void**. NC's statute uses the word "void" — stronger than FL's "unenforceable."
**Fix:** Require at minimum county parcel ID + street address; strongly prefer auto-populating the recorded legal description; block generation on a blank description for NC. See remediation R-2.
**Sources:** FL SOF — https://www.pmlawfla.com/florida-statute-of-frauds-writing/ ; NC SOF G.S. 22-2 — https://www.smithdebnamlaw.com/article/decoding-the-statute-of-frauds-and-its-impact-in-north-carolina/ ; *Kidd v. Early* — https://law.justia.com/cases/north-carolina/supreme-court/1976/69-0-0.html

## R-3 — No termination mechanism / notice 🟠 FL / 🟠 NC
**What:** Clauses 2b/2c grant exits but provide **no instrument to exercise them** and there is no notices clause (see R-14). A right with no defined mechanism to invoke it, within what window, delivered how, is a latent dispute and can strand the earnest money.
**Both states:** Best practice (and NC's due-diligence model in particular) runs on **written termination notice within a defined period**. Absent a mechanism, whether/when the buyer validly terminated is arguable.
**Fix:** Add a Notice of Termination document (inventory #5) + a notices clause specifying method, addresses, deadline, and deposit-return instruction.

## R-4 — Unlicensed real-estate brokerage exposure 🔴 FL / 🔴 NC
**What:** Wholesaling is legal in both states when you assign **your own equitable/contractual interest** — but marketing **the property itself for the owner** can be unlicensed brokerage. The CRM's seller/builder emails and the "I have X under contract and I'm assigning it to you" flow must stay on the "selling my contract" side of the line.
**FL (Fla. Stat. §§ 475.01, 475.42):** Acting as a broker "for another, for compensation" without a license is a **third-degree felony** (up to 5 yrs / $5,000). The exemption theory is that assigning your own contract isn't "for another." The marketing line is not a bright-line statute — fact-sensitive. ATTORNEY TO CONFIRM where the line sits for our email/marketing copy, and re-verify no 2023–2026 FL wholesaling statute/FREC rule was enacted.
**NC (G.S. 93A-1/93A-2; NCREC guidance):** NCREC expressly says a license is *not* required to assign your contract rights, but lists disqualifying conduct: marketing to sellers you'll "buy for cash" with **no intent to buy**; **misrepresenting your ownership interest**; **handling third-party earnest money/DD fees**; **negotiating** between seller and end-buyer; and **"marketing of buyers generally, unconnected to the transfer of a specific assigned purchase contract."** Also: **HB 797** (would have required wholesaler licensing/disclosures, proposed eff. 10/1/2025) **stalled in the Senate and was NOT enacted** — but the biennium is open; **verify current status first**, it flips the answer.
**Fix:** Audit CRM email/marketing copy against these lines; add the wholesaler disclosure (R-11); route all deposits through a neutral title/attorney (R-10). ATTORNEY + NCREC to confirm.
**Sources:** FL § 475.01 — https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0475/Sections/0475.01.html ; FL § 475.42 penalty — https://m.flsenate.gov/Statutes/475.42 ; NCREC unlicensed-activity/wholesaling — https://bulletins.ncrec.gov/brokers-consumers-should-beware-of-unlicensed-activity-in-north-carolina/ ; NC HB 797 status — https://www.ncleg.gov/BillLookup/2025/H797

## R-5 — FL documentary-stamp tax on the assignment / assignment fee 🔴 FL
**What:** FL doc-stamp tax (Fla. Stat. § 201.02) attaches to any writing by which land "or **any interest therein**" is "**granted, assigned, transferred, or otherwise conveyed**." Under **equitable conversion**, a buyer under an enforceable purchase contract holds equitable title. That gives FL DOR a colorable argument that **assigning the contract conveys a taxable equitable interest and the assignment fee is taxable consideration**. FAC 12B-4.013 clearly taxes assignment of an **agreement/contract for deed**; whether an ordinary executory purchase contract's assignment is taxed is **not cleanly resolved** in public guidance, and **no on-point DOR Technical Assistance Advisement was located.**
**Impact:** A surprise 0.7% (of the fee, or worse of total consideration) tax, plus self-reporting duties: taxable transfers are due **whether or not recorded**, remitted by the 20th of the following month, and anyone averaging **5+ taxable transactions/month must register with DOR**. A high-volume wholesaler can't assume "unrecorded = untaxed."
**Structuring:** **Double close** = two deeds = doc stamps **twice** (predictable, higher cost). **Assignment** = one deed but **ambiguous fee taxability**.
**Fix:** ATTORNEY TO CONFIRM — strongly recommend a **DOR TAA request** for this fact pattern before relying on "assignment fee is untaxed." Add fee-characterization language (inventory #10). Decide assignment vs. double-close per deal.
**Sources:** § 201.02 — https://www.flsenate.gov/Laws/Statutes/2025/0201.02 ; FAC 12B-4.013 — http://flrules.elaws.us/fac/12b-4.013 ; DOR doc-stamp — https://floridarevenue.com/taxes/taxesfees/Pages/doc_stamp.aspx ; why equitable interests get taxed — https://www.koontzassociates.com/blog/2012/08/01/real-estate/why-are-documentary-stamp-taxes-due-on-quit-claim-deeds/

## R-6 — NC excise-tax base & assignment-vs-double-close 🟠 NC
**What:** NC excise tax (G.S. 105-228.30, $1/$500 = $2/$1,000) attaches to "each **instrument by which any interest in real property is conveyed**," collected by the Register of Deeds **at recording**, **seller pays by custom**. An **unrecorded assignment of contract is not the taxable instrument** and the fee is **not directly taxed** — but no primary authority squarely confirms it (reasoned from the statute).
**Two exposures:** (a) In a straight assignment (one deed seller→end-buyer), is the taxable base the seller's price or price+fee? Depends on how the fee is documented on the settlement statement. (b) A **double close records two deeds → excise taxed twice**; a straight assignment records one → taxed once.
**Wake County:** **No local land-transfer tax** (only 7 NE/coastal counties have one; Wake is not among them). Only the state excise applies. ATTORNEY TO CONFIRM current Wake ROD fee schedule.
**Fix:** ATTORNEY TO CONFIRM base treatment; document the fee explicitly as an assignment fee (inventory #10); choose structure deliberately.
**Sources:** G.S. 105-228.30 — https://www.ncleg.net/enactedlegislation/statutes/html/bysection/chapter_105/gs_105-228.30.html ; NCDOR conveyance tax — https://www.ncdor.gov/taxes-forms/other-taxes-and-fees/conveyance-tax ; NC transfer-tax counties — https://listwithclever.com/real-estate-blog/north-carolina-real-estate-transfer-taxes-an-in-depth-guide/

## R-7 — "Buyer pays documentary stamps" contradicts default 🟡 FL / 🟡 NC
**What:** PSA clause 4 assigns documentary stamps to the Buyer. **FL default: seller pays deed doc stamps.** **NC default: seller pays excise tax.** Reference forms in both states default the transfer tax to the **seller**.
**Impact:** Not fatal (allocation is negotiable) but atypical; may confuse the closing agent and shifts cost onto the buyer/end-buyer unnecessarily. If intentional, make it a **conspicuous negotiated deviation**; if not, correct it.
**Fix:** Split closing-cost allocation from transfer-tax allocation; default transfer tax to seller (or make deviation explicit). See remediation R-7.
**Sources:** FL seller-pays doc stamps — https://barneswalker.com/florida-documentary-stamp-tax/ ; NC seller-pays excise — https://shws.law/who-pays-the-taxes-in-north-carolina-real-estate-closing/

## R-8 — Homestead / spousal joinder & marital interest 🟠 FL / 🟠 NC
**What:** Signature block captures only free-text names; no spouse/entity lines.
**FL (Art. X §4 Fla. Const.; §§ 689.01, 732.702/.7025):** Homestead owned by a married person can't be alienated without **spousal joinder**; a one-spouse conveyance is **voidable** with effectively no limitations period. **Vacant land is usually NOT homestead** unless contiguous to/used with the residence — so joinder is usually not required, **but confirm per parcel** (check the appraiser's homestead records). A homestead-tainted contract signed by one spouse may be unenforceable — directly threatening our ability to assign/enforce.
**NC (Ch. 41 Art. 5; G.S. 39-13.3; Ch. 52):** **Tenancy by the entirety requires BOTH spouses** to convey — a one-spouse deed is ineffective. For **solely-titled** property the spouse needn't sign to pass title, but the **marital/elective-share interest survives** unless released via spousal joinder on the deed or a **recorded free-trader agreement**; title companies commonly require it.
**Fix:** Capture ownership/marital status up front; add spousal-joinder & entity-authority rider (inventory #11); flag homestead check in FL. ATTORNEY TO CONFIRM per parcel.
**Sources:** FL homestead spousal consent — https://www.alperlaw.com/florida-asset-protection/florida-homestead-law/spousal-consent-and-rights/ ; NC entireties/free-trader — https://www.statewidetitle.com/newsletterarticle.asp?Article=476

## R-9 — Witness / notary / e-signature formalities 🟡 FL / 🟡 NC
**What:** The **contract** generally needs no witnesses/notary in either state, but the **deed** does, and if we ever record a memorandum, recording formalities attach.
**FL:** Deed needs **two subscribing witnesses + notary**; **eff. 1/1/2024, § 695.26** requires witnesses' printed names **and mailing addresses** to record. Our contract/signature block has none of this (fine for the contract; relevant for any recorded instrument and for the eventual deed).
**NC:** Deed must be **acknowledged (notarized)** to record (G.S. 47-14, 47-17); **no subscribing witnesses** required for an ordinary deed. Memorandum must be notarized (and, under G.S. 47-119.1, **signed by the seller**).
**E-sign:** Valid for contract + assignment under **ESIGN + UETA** (FL § 668.50; NC G.S. 66-311 et seq.) **only if the parties agreed to transact electronically** — we have no e-sign consent clause (R-14/#29).
**Fix:** Add e-sign consent + counterparts; keep deed/memorandum formalities in the deed/memorandum renderers, not the contract. ATTORNEY TO CONFIRM current text.
**Sources:** FL § 695.26 — https://harbourbusinesslaw.com/riding-the-wave-of-change-your-fun-florida-guide-to-the-new-deed-recording-rules-fl-statute-695-26-effective-january-1-2024/ ; NC acknowledgment G.S. 47-17 — https://www.ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_47/GS_47-17.pdf ; FL UETA § 668.50 — https://www.flsenate.gov/laws/statutes/2023/668.50 ; NC UETA — https://law.justia.com/codes/north-carolina/chapter-66/article-40/

## R-10 — Earnest-money handling & escrow terms 🟠 FL / 🟠 NC
**What:** Escrow terms exist only as prose in `titleCompanyEmail()` ([contractEmail.ts:82](apps/crm/src/lib/contractEmail.ts)). No written escrow instructions / earnest-money receipt.
**FL:** If a **broker** holds it, FREC rules apply (deposit within 3 business days; no commingling; Fla. Stat. § 475.25; FAC 61J2-14) with fines/discipline. With a **title/escrow agent** the escrow terms govern — so they must be written. An **unlicensed principal should not hold another party's deposit.**
**NC:** NCREC trust rules apply only when a **broker** holds funds; principal-to-principal, an **attorney/title agent** holds escrow. NCREC flags a wholesaler **handling third-party deposits** as an unlicensed-brokerage red flag (ties to R-4).
**Fix:** Generate written escrow instructions / earnest-money receipt (inventory #8); never route deposits through the wholesaler. ATTORNEY TO CONFIRM structure.
**Sources:** FL escrow rules — https://www.floridarealtors.org/law-ethics/library/florida-escrow-laws-rules ; NCREC unlicensed-activity (deposits) — https://bulletins.ncrec.gov/brokers-consumers-should-beware-of-unlicensed-activity-in-north-carolina/

## R-11 — No wholesaler / equitable-interest disclosure to seller 🟡 FL / 🟠 NC
**What:** No written statement to the seller that Buyer is a wholesaler holding only equitable interest and intends to assign for profit.
**FL:** No statute found mandating it; **best practice** to reduce fraud/FDUTPA exposure and support the licensing position (R-4). ATTORNEY TO CONFIRM.
**NC:** Higher — NCREC treats **misrepresenting ownership interest** as an unlicensed-activity/deception trigger, and UDTP (Ch. 75) exposure runs parallel. Affirmative honesty is effectively required even though HB 797's codified disclosure did not pass.
**Fix:** Add the disclosure document (inventory #6). ATTORNEY TO CONFIRM whether a signed form is mandated.
**Sources:** NCREC guidance (above); NC HB 797 — https://lrs.sog.unc.edu/billsum/h-797-2025-2026

## R-12 — Vacant-land seller-disclosure duty 🟡 FL / 🟢 NC
**FL:** *Johnson v. Davis* (480 So. 2d 625) requires disclosure of known, material, non-obvious defects for **residential** property; FL courts **declined to extend it to commercial/undeveloped land**; **vacant-lot application is unsettled**. "As-is" (our clause 2a) disclaims warranties but **does not** kill a disclosure duty where one exists. ATTORNEY TO CONFIRM per parcel.
**NC:** Residential Property Disclosure Act (G.S. 47E) **does not apply to vacant land** — no statutory disclosure form required; low risk (fraud/concealment liability still exists regardless).
**Fix:** Seller disclosure/waiver document (inventory #7), used per attorney guidance.
**Sources:** *Johnson v. Davis* — https://law.justia.com/cases/florida/supreme-court/1985/65330-0.html ; NC 47E scope — https://codes.findlaw.com/nc/chapter-47e-residential-property-disclosure-act/nc-gen-st-sect-47e-2.html

## R-13 — Assignment relies on "and/or assigns"; NC anti-assignment default 🟡 FL / 🟠 NC
**What:** Assignability rests on the party-line phrase, not an operative clause (#27).
**FL:** Contracts are assignable by default; "and/or assigns" is belt-and-suspenders, not required — but the operative form may have its own assignment provision. Lower risk.
**NC:** The **standard NC Form 2-T is anti-assignment** — "may not be assigned without the written consent of all parties" (except 1031). If a deal uses a standard NC form, "and/or assigns" **won't** override it; the assignment could be **ineffective against the seller** without consent. NC REALTORS confirms there is **no standard NC assignment form** — a custom instrument is needed (which we have, but it needs the consent hook).
**Fix:** Add an explicit assignment-permitted clause to the PSA and a seller-consent/acknowledgment to the assignment (A13). ATTORNEY TO CONFIRM.
**Sources:** NC Form 2-T anti-assignment — https://www.ncrealtors.org/wp-content/uploads/markedup0725-2-T.pdf ; no standard assignment form — https://www.ncrealtors.org/question/is-there-a-standard-form-for-assigning-a-contract/

## R-14 — Missing boilerplate: default/remedies, governing law/venue, notices, TOE, prorations, dispute resolution 🟠 FL / 🟠 NC
**What:** Both documents omit default & remedies, governing law/venue, notices, time-is-of-the-essence, tax prorations, dispute resolution, attorney's fees, integration, counterparts/e-sign. Individually medium; **together** they make the contracts brittle and hard to enforce, and the missing notices clause blocks the (missing) termination mechanism (R-3).
**Fix:** Add the standard clause block, with FL/NC variants where they differ (governing law per market). See remediation.

## R-15 — Memorandum-of-contract recording risk 🟡 FL / 🟠 NC (future doc)
**What:** If we build/record a Memorandum (inventory #3), recording it improperly clouds the seller's title and invites **slander-of-title / tortious-interference** suits; title companies may refuse to insure over it.
**FL:** Recordable under Ch. 695 with notarization + § 695.26 formatting; baseless recording to pressure a seller is the paradigm bad-faith case.
**NC:** The statutory purchase-contract memorandum (**G.S. 47-119.1**) **must be signed and notarized by the seller** — we **cannot** record a conforming one unilaterally; a seller-unsigned recording is both non-conforming and high-risk. Pure-race (Connor Act) makes recording valuable but doesn't excuse an invalid instrument.
**Fix (if we build it):** Only with (a) an express contractual **right to record**, (b) the **seller's signature/notarization**, and (c) an **auto-release/satisfaction on termination**. ATTORNEY TO CONFIRM.
**Sources:** NC G.S. 47-119.1 — https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_47/GS_47-119.1.html ; slander-of-title/wholesaler risk — https://www.plattwestby.com/real-estate-wholesalers-seller-beware/ ; FL memorandum — https://www.deeds.com/forms/florida/memorandum-and-notice-of-agreement/

## R-16 — Assignment protective-clause gaps 🟠 FL / 🟠 NC
**What:** The assignment omits: assignor rep that the PSA is valid/in force/unassigned (A7); assignee acknowledgment of receipt/review of the PSA (A8); non-circumvention (A9); indemnification (A10); remedy on assignee default (A11); explicit handling of already-posted earnest money (A12). The economic mechanics are fine; the *protections* are absent, so a bad-faith or defaulting assignee has little downside and can circumvent to the seller.
**Fix:** Add these clauses (remediation R-16). Non-circumvention can also be a standalone NCND (inventory #4).

---

## Cross-cutting "confirm first" items for the attorneys
1. **NC HB 797 status** — verify it remains unenacted; if it (or a successor) passed, residential wholesaling becomes licensed activity with mandatory disclosures (flips R-4/R-11).
2. **FL assignment-fee doc stamps** — consider a **DOR TAA** before relying on "fee untaxed" (R-5).
3. **NC excise base** on a straight assignment and the assignment-vs-double-close count (R-6).
4. **Per-parcel homestead (FL) / entireties & marital (NC)** status before signing (R-8).
5. **Marketing/email copy** audit against the unlicensed-brokerage line in each state (R-4).

Proceed to the attorney-ready packet: [CONTRACTS_ATTORNEY_PACKET.md](project-docs/CONTRACTS_ATTORNEY_PACKET.md).
