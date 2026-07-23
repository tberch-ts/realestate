import { beforeAll, describe, expect, it } from 'vitest';
import type { AssignmentContractInput, LandContractInput } from '@mfa/shared';
import { renderAssignmentContractPdf, renderLandContractPdf } from '../landContract.js';
import { pdfToText } from './pdfText.js';

// Golden-file tests for the land-wholesaling contract renderers.
//
// This is a CHARACTERIZATION suite: it pins the current rendered output so
// the Phase 2/3 clause-hardening work (see project-docs/CONTRACTS_REMEDIATION_PLAN.md)
// can refactor the renderers without silently dropping a clause. The
// `requiredClauses` table pattern below is the mechanism Phase 5 extends
// per document and per state (FL/NC variants).
//
// Assert against the whitespace-collapsed text (pdfToText), not exact
// lines — pdfkit wraps justified paragraphs unpredictably.

const psaSample: LandContractInput = {
  sellerNames: 'Jane Doe and John Doe',
  buyerName: 'Acme Land LLC',
  address: '123 Vacant Lot Rd, Tampa, FL',
  parcelId: 'U-01-23-45-6789',
  legalDescription: 'Lot 7, Block 2, SUNSHINE ACRES, per plat book 45 page 12',
  purchasePrice: 60000,
  feasibilityDays: 30,
  closingAgentName: 'ABC Title LLC',
  closingAgentAddress: '500 Main St, Tampa, FL',
  earnestMoney: 100,
  effectiveDate: '2026-07-23',
  closingDate: '2026-09-15',
};

const assignmentSample: AssignmentContractInput = {
  assignorName: 'Acme Land LLC',
  assigneeName: 'Coastal Homes LLC',
  sellerNames: 'Jane Doe and John Doe',
  originalAgreementDate: '2026-07-23',
  address: '123 Vacant Lot Rd, Tampa, FL',
  parcelId: 'U-01-23-45-6789',
  legalDescription: 'Lot 7, Block 2, SUNSHINE ACRES, per plat book 45 page 12',
  originalPrice: 60000,
  assignmentFee: 10000,
  closingAgentName: 'ABC Title LLC',
  closingAgentAddress: '500 Main St, Tampa, FL',
  effectiveDate: '2026-07-23',
  closingDate: '2026-09-15',
};

describe('renderLandContractPdf (Purchase & Sale Agreement)', () => {
  const requiredClauses: Array<{ id: string; re: RegExp }> = [
    { id: 'title', re: /PURCHASE AND SALE AGREEMENT/ },
    { id: 'buyer-and-or-assigns', re: /Buyer and\/or assigns/ },
    { id: 'seller-names', re: /Jane Doe and John Doe/ },
    { id: 'purchase-price', re: /purchase price is to be \$60,000/ },
    { id: 'as-is', re: /AS-IS CONDITION/ },
    { id: 'known-facts', re: /known facts that affect the value/ },
    { id: 'feasibility-period', re: /feasibility study will continue for a period of 30 days/ },
    { id: 'clear-title-exit', re: /cannot provide a clear title/ },
    { id: 'closing-agent', re: /ABC Title LLC/ },
    { id: 'earnest-held-at-closing-agent', re: /Earnest Money will be deposited by Buyer and held at the Closing Agent/ },
    { id: 'buyer-pays-costs', re: /Buyer to pay all title-related charges/ },
    { id: 'template-disclaimer', re: /TEMPLATE ONLY . NOT LEGAL ADVICE/ },
  ];

  // Render + parse once; assert against the cached text. pdf-parse's
  // bundled pdfjs is flaky when invoked repeatedly in a tight loop, and a
  // single parse is all these deterministic assertions need.
  let txt = '';
  beforeAll(async () => {
    txt = await pdfToText(await renderLandContractPdf(psaSample));
  });

  it('renders a non-empty PDF buffer', async () => {
    const buf = await renderLandContractPdf(psaSample);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it.each(requiredClauses)('contains clause: $id', ({ re }) => {
    expect(txt).toMatch(re);
  });

  it('formats the effective date without the UTC off-by-one', () => {
    expect(txt).toContain('July 23, 2026');
  });

  it('renders the provided legal description', () => {
    expect(txt).toContain('SUNSHINE ACRES');
  });

  // R-2 (CONTRACTS_RISK_REGISTER.md): a blank legal description currently
  // renders as a placeholder underline rather than being rejected. This
  // pins today's (unsafe) behavior; when Phase 2 hard-requires a
  // description, flip this to assert rejection instead.
  it('KNOWN GAP R-2: blank legal description renders an underline placeholder', async () => {
    const txt = await pdfToText(await renderLandContractPdf({ ...psaSample, legalDescription: undefined }));
    expect(txt).toContain('Legal Description');
    expect(txt).toMatch(/_{6,}/); // long underline stands in for the missing description
  });

  it('respects earnest money of 0 (R-1 illustration)', async () => {
    const txt = await pdfToText(await renderLandContractPdf({ ...psaSample, earnestMoney: 0 }));
    expect(txt).toContain('consideration of the sum of $0');
  });
});

describe('renderAssignmentContractPdf (Assignment of Contract)', () => {
  const requiredClauses: Array<{ id: string; re: RegExp }> = [
    { id: 'title', re: /ASSIGNMENT OF PURCHASE AND SALE AGREEMENT/ },
    { id: 'assignor-assignee', re: /Acme Land LLC .*Assignor.* assigns and transfers to Coastal Homes LLC/ },
    { id: 'references-psa', re: /Purchase and Sale Agreement dated July 23, 2026/ },
    { id: 'assignment-fee', re: /assignment fee of \$10,000, due and payable at closing/ },
    { id: 'assumes-obligations', re: /assumes and agrees to perform all of Buyer's obligations/ },
    { id: 'escrow-holds-all', re: /hold the Agreement, this Assignment, and all deposits in escrow/ },
    { id: 'void-if-no-closing', re: /this Assignment is void/ },
    { id: 'template-disclaimer', re: /TEMPLATE ONLY . NOT LEGAL ADVICE/ },
  ];

  let txt = '';
  beforeAll(async () => {
    txt = await pdfToText(await renderAssignmentContractPdf(assignmentSample));
  });

  it('renders a non-empty PDF buffer', async () => {
    const buf = await renderAssignmentContractPdf(assignmentSample);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it.each(requiredClauses)('contains clause: $id', ({ re }) => {
    expect(txt).toMatch(re);
  });
});

// Scaffold for the post-attorney-review clause additions. These are the
// required-clause assertions Phase 2/5 will implement per state; kept as
// `todo` so the intended coverage is visible in the test report without
// failing the build today. See project-docs/CONTRACTS_REMEDIATION_PLAN.md.
describe('PSA hardening — pending attorney redlines', () => {
  it.todo('NC: renders a non-refundable due-diligence fee to the seller (R-1)');
  it.todo('FL: renders the "$10 and other good and valuable consideration" recital (R-1)');
  it.todo('NC: rejects generation when the legal description is blank (R-2)');
  it.todo('adds a Notice of Termination mechanism + notices clause (R-3)');
  it.todo('defaults transfer tax to the seller; state-correct tax name (R-7)');
  it.todo('renders default & remedies, governing law/venue, time-is-of-the-essence (R-14)');
  it.todo('renders signatory-capacity + FL spousal-joinder / NC entireties lines (R-8)');
});

describe('Assignment hardening — pending attorney redlines', () => {
  it.todo('assignor represents the PSA is valid, in force, and unassigned (R-16)');
  it.todo('assignee acknowledges receipt and review of the PSA (R-16)');
  it.todo('adds non-circumvention + assignee-default remedy (R-16)');
  it.todo('states disposition of any already-posted earnest money (R-16)');
  it.todo('adds a fee-characterization instruction to the closing agent (R-5/R-6)');
});
