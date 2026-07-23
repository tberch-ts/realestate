# Contracts Remediation Plan — Engineering

**Status:** Plan only. **No code or template changes have been made.** Per the task, we deliver findings + plan first and wait for the user's go-ahead (and ideally the attorney redlines) before touching the live generators.

This is the engineering plan to implement the fixes identified in [CONTRACTS_CLAUSE_AUDIT.md](project-docs/CONTRACTS_CLAUSE_AUDIT.md) and [CONTRACTS_RISK_REGISTER.md](project-docs/CONTRACTS_RISK_REGISTER.md) and to add the missing documents from [CONTRACTS_INVENTORY.md](project-docs/CONTRACTS_INVENTORY.md).

**Golden rule:** legal wording lands **after** attorney review (one per state). Engineering can build the *scaffolding* — new types, renderers, form fields, FL/NC variant plumbing, and the test harness — in parallel using placeholder clause text clearly marked `ATTORNEY-DRAFT`, so that dropping in redlined language is a small change.

---

## ⚠️ Correction to a task premise: there is no test harness yet

The task references "the PDF-text assertion approach already used in this repo." **There is none.** A repo-wide search found **zero** test files (`*.test.ts`, `*.spec.ts`, no `__tests__/`), and neither the root [`package.json`](package.json) nor [`apps/api/package.json`](apps/api/package.json) declares vitest/jest or a `test` script. So the plan **introduces** the test harness rather than extending one. This is called out so the estimate is honest.

---

## Current architecture (what we're extending)

- **Generators:** [`apps/api/src/landContract.ts`](apps/api/src/landContract.ts) — pure `pdfkit` functions returning `Promise<Buffer>`, with local helpers `fieldLine`, `numbered`, `lettered`, `sig`, `fmtMoney`, `fmtDate`. Same pattern as [`apps/api/src/loi.ts`](apps/api/src/loi.ts).
- **Types:** [`packages/shared/src/index.ts`](packages/shared/src/index.ts) — `LandContractInput`, `AssignmentContractInput`.
- **Routes:** [`apps/api/src/routes/land.ts`](apps/api/src/routes/land.ts) — `POST /api/land/contract`, `POST /api/land/contract/assignment`; applies defaults (`feasibilityDays ?? 30`, `earnestMoney ?? 0`).
- **CRM form:** [`apps/crm/src/pages/LandContract.tsx`](apps/crm/src/pages/LandContract.tsx) — two tabs, shared property/title fields; `mailto:` emails from [`apps/crm/src/lib/contractEmail.ts`](apps/crm/src/lib/contractEmail.ts).
- **Market config:** [`apps/api/src/config/markets.ts`](apps/api/src/config/markets.ts) — `MarketConfig.stateCode` (`'FL'`/`'NC'`) is the natural key for state variants.

---

## Phase 0 — Test harness + golden-file scaffolding (no legal dependency; do first)

Do this before the clause work so every subsequent change is regression-guarded.

1. **Add vitest** to `@mfa/api` (dev dep) + a `"test": "vitest run"` script; wire into the build/CI as a gate.
2. **PDF text extraction for assertions.** `pdfkit` output isn't plain text; add `pdf-parse` (or `pdfjs-dist`) as a dev dep and a helper:
   ```ts
   // apps/api/src/__tests__/pdfText.ts
   export async function pdfToText(buf: Buffer): Promise<string> { /* pdf-parse → normalize whitespace */ }
   ```
   Normalize whitespace (pdfkit line-wraps justified text, so assert on collapsed single-spaced strings / use `.includes` and regex, not exact line equality).
3. **First golden tests** pin *current* behavior for both existing renderers (a characterization test), so we can refactor safely:
   ```ts
   const txt = await pdfToText(await renderLandContractPdf(sample));
   expect(txt).toContain('PURCHASE AND SALE AGREEMENT');
   expect(txt).toContain('Buyer and/or assigns');
   ```
4. **Required-clause assertion pattern** (the core mechanism reused per document): a table of `{ id, mustContain: RegExp }` per document type, asserted against the rendered text. This is what enforces "required clauses present" going forward.

**Deliverable:** `apps/api/src/__tests__/landContract.test.ts` green against today's output; `npm -w @mfa/api test` runs in CI.

---

## Phase 1 — Shared types + FL/NC variant plumbing

1. **Add `state` to the inputs.** Extend `LandContractInput` and `AssignmentContractInput` with `state: 'FL' | 'NC'` (or reuse `stateCode`). The route can infer it from the market when a property is attached, or the form supplies it. Variant selection keys off this.
2. **New optional fields** on `LandContractInput` (all optional so old callers keep compiling; renderer supplies ATTORNEY-DRAFT defaults):
   - `governingLawState`, `venueCounty`
   - `dueDiligenceFee?: number` (NC), `independentConsideration?: number` (FL recital)
   - `earnestDeliveryDays?: number`
   - `transferTaxPaidBy?: 'seller' | 'buyer'` (default `'seller'` — R-7)
   - `deedType?: 'warranty' | 'special_warranty'`
   - `sellerReps?: {...}`, `sellerMaritalStatus?`, `sellerEntityType?`, `signerCapacity?`
   - `allowAssignment?: boolean`, `recordMemorandum?: boolean`
3. **New fields** on `AssignmentContractInput`: `assignorReps`, `assigneeAcknowledgesPSA`, `nonCircumventionMonths?`, `earnestMoneyDisposition?`, `sellerConsent?`.
4. **New document input types:** `MemorandumInput`, `NcndInput`, `TerminationNoticeInput`, `WholesalerDisclosureInput`, `EarnestReceiptInput`. Keep them minimal and share a `PropertyRef` sub-type (`address`, `parcelId`, `legalDescription`, `state`) to avoid repetition.
5. **Rebuild `@mfa/shared`** (`npm -w @mfa/shared run build`) — the API imports the built package.

---

## Phase 2 — Harden the two existing renderers (`landContract.ts`)

Behind attorney-approved wording; engineering builds the structure now with `ATTORNEY-DRAFT` placeholders.

1. **Block/last-resort the blank legal description (R-2).** `fieldLine` currently prints an underline when empty. For contracts, require description at the type/route level:
   - Route validation: reject when `legalDescription` is empty **and** (parcelId or address insufficient) — at minimum, hard-require it for `state === 'NC'`.
   - CRM: make **Legal description required**, with helper text; offer parcel-ID autopopulate where a land lead is the source.
2. **Feasibility clause (R-1, R-3).** Replace clause 2b text with a sole-discretion, written-notice cancellation; render the **day-count** explicitly. Add the **NC due-diligence fee** line when `state==='NC'`; add the **FL consideration recital** when `state==='FL'`.
3. **Earnest money (R-1, R-10).** Render delivery deadline + escrow-agent duties; warn (CRM) when amount is 0.
4. **Costs / transfer tax (R-7).** Split clause 4; render transfer-tax allocation from `transferTaxPaidBy` (default seller), with the state-correct tax name ("documentary stamp tax" FL / "excise tax" NC).
5. **New clause block:** seller reps, assignment-permitted, default & remedies, governing law/venue, notices, time-is-of-essence, prorations, dispute resolution, attorney's fees, deed type, counterparts/e-sign consent, integration. These will push past one page — **accept multi-page** (drop the "keep on 1 page" constraint) or split standards to a second page like the FR/BAR "Standards" block.
6. **Signature/authority block (R-8).** Entity capacity line; FL spousal-joinder line (+ homestead determination checkbox); NC both-spouses/free-trader path.
7. **Assignment renderer:** add assignor reps, assignee PSA-acknowledgment, non-circumvention, indemnity, assignee-default remedy, explicit earnest-money disposition, seller-consent block, fee-characterization instruction, governing law/notices/e-sign.

**Refactor note:** extract a shared `clauseBlock(doc, clauses)` and a `variant(state, fl, nc)` helper so FL/NC differences are data, not branches scattered through the writer.

---

## Phase 3 — Four (five) new document renderers

New pure `pdfkit` functions in `landContract.ts` (or split into `apps/api/src/landDocs/*.ts` if the file grows too large), each with a route and a golden test:

1. **`renderMemorandumPdf(MemorandumInput)`** (R-15) — short recordable notice. **FL:** notarization + § 695.26 witness-name/address formatting placeholders. **NC:** G.S. 47-119.1 fields incl. **seller signature + notary + expiration date**. Gate behind `recordMemorandum` and an explicit PSA right-to-record; ship with an auto-generated **Release/Satisfaction** companion.
2. **`renderNcndPdf(NcndInput)`** (inventory #4) — non-circumvention/NCND with the builder; standalone so it can be signed before disclosure.
3. **`renderTerminationNoticePdf(TerminationNoticeInput)`** (inventory #5, R-3) — exercises the feasibility/title exit; references PSA, states ground, instructs deposit return.
4. **`renderWholesalerDisclosurePdf(WholesalerDisclosureInput)`** (inventory #6, R-11) — equitable-interest disclosure to seller. FL/NC variants.
5. **(stretch) `renderEarnestReceiptPdf` / escrow instructions** (inventory #8, R-10).

Each renderer must include the `TEMPLATE ONLY — NOT LEGAL ADVICE` footer and an `ATTORNEY-DRAFT` banner until sign-off.

---

## Phase 4 — Routes + CRM form + emails

1. **Routes:** add `POST /api/land/contract/memorandum`, `/ncnd`, `/termination`, `/wholesaler-disclosure` mirroring the existing validation/response pattern in [`land.ts`](apps/api/src/routes/land.ts). Keep the "literal path before `:market`" ordering note.
2. **CRM form ([`LandContract.tsx`](apps/crm/src/pages/LandContract.tsx)):**
   - Add a **state selector** (FL/NC) driving variants; default from the property/market if present.
   - Make **legal description required**; add DD-fee (NC) / consideration (FL), transfer-tax payer, deed type, marital/entity fields.
   - Add tabs/buttons for the new documents.
   - Surface a clear **"ATTORNEY-DRAFT — not yet reviewed for your state"** banner until sign-off.
3. **Emails ([`contractEmail.ts`](apps/crm/src/lib/contractEmail.ts)):** audit copy against the unlicensed-brokerage line (R-4) — frame as assigning our contract, not listing the property; reference the new disclosure doc; keep title-company escrow framing.

---

## Phase 5 — Golden-file tests (required-clause + edge cases)

The heart of the QA ask. For **each** document, a required-clause table asserted against rendered text, split by state where variants differ.

**Required-clause assertions (examples):**
```ts
const REQUIRED_PSA_NC = [
  { id: 'due-diligence-fee', re: /due diligence fee/i },
  { id: 'governing-law-nc', re: /laws of the State of North Carolina/i },
  { id: 'assignment-permitted', re: /may assign/i },
  { id: 'termination-notice', re: /written notice/i },
];
for (const c of REQUIRED_PSA_NC) it(`NC PSA has ${c.id}`, async () =>
  expect(await pdfToText(await renderLandContractPdf(nc))).toMatch(c.re));
```

**Edge cases to assert (from the risk register):**
- **Blank legal description** → NC generation is rejected (route test returns 400) / FL renders a hard warning; assert the underline-only path can't ship for NC. *(R-2)*
- **$0 earnest** → assert the consideration recital / DD-fee still present so the contract isn't left bare. *(R-1)*
- **Entity/multi-owner signers** → assert capacity line renders ("By: … its Manager") and a second seller-signature line appears for two owners. *(R-8)*
- **FL homestead** → assert spousal-joinder line + homestead-determination text renders when `state==='FL'`. *(R-8)*
- **Transfer tax** → assert FL output says Seller pays documentary stamp tax by default; NC output says Seller pays excise tax by default. *(R-7)*
- **Assignment** → assert assignor validity rep, assignee PSA-acknowledgment, non-circumvention, assignee-default remedy, and fee-characterization line all render. *(R-16)*
- **Variant isolation** → an FL-only clause must **not** appear in NC output and vice-versa.

**Coverage gate:** CI fails if any required-clause assertion is missing for a shipped document/state.

---

## Sequencing & effort (rough)

| Phase | Depends on | Legal sign-off needed? | Rough size |
|-------|-----------|------------------------|-----------|
| 0 — test harness | — | No | S |
| 1 — types + variant plumbing | 0 | No | S–M |
| 2 — harden existing renderers | 1 | **Wording yes**, structure no | M |
| 3 — new renderers | 1 | **Wording yes**, structure no | M–L |
| 4 — routes + CRM + emails | 2,3 | Partial (email copy) | M |
| 5 — golden tests | 2–4 | No | M |

**Recommended order:** Phase 0 → 1 immediately (no legal dependency, de-risks everything). Build 2–3 structure with `ATTORNEY-DRAFT` placeholders. **Send the attorney packet in parallel.** When redlines return, drop wording into the placeholders and finalize FL/NC variants, then complete 4–5.

## Guardrails
- **Do not remove the `TEMPLATE ONLY — NOT LEGAL ADVICE` footer.** Add an `ATTORNEY-DRAFT` banner on any clause not yet state-reviewed.
- Keep renderers **pure** (input → Buffer) so they stay unit-testable.
- Every new document ships **with its test** in the same PR — no untested renderer merges.
- Land the FL/NC redlines as **data/variants**, not forks, so a third state later is one config entry (mirrors the `MARKETS` pattern).

---

## Definition of done
1. `npm -w @mfa/api test` runs golden-file tests for all six documents, both states, in CI.
2. Every risk in [CONTRACTS_RISK_REGISTER.md](project-docs/CONTRACTS_RISK_REGISTER.md) is either fixed, has a tracked follow-up, or is explicitly deferred with attorney sign-off.
3. Attorney redlines (FL + NC) are implemented as state variants; no `ATTORNEY-DRAFT` banners remain on shipped clauses.
4. Blank legal description and $0 earnest can no longer silently produce a bare contract.
