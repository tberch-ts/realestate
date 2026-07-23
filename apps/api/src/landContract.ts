import PDFDocument from 'pdfkit';
import type { AssignmentContractInput, LandContractInput } from '@mfa/shared';

// Generate the 1-page vacant-land Purchase & Sale Agreement as a PDF
// buffer. Modeled on the land-wholesaling assignment playbook: the buyer
// signs as "Buyer and/or assigns", the feasibility-study and clear-title
// clauses are the buyer's no-risk exits, earnest money (if any) sits with
// the closing agent, and the buyer covers closing costs — the seller nets
// exactly the purchase price. Same pdfkit pattern as loi.ts.
//
// TEMPLATE ONLY. The PDF itself carries the attorney-review disclaimer;
// contract law is state-specific (e.g. FL doc stamps vs NC excise tax).
export function renderLandContractPdf(input: LandContractInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 40, left: 60, right: 60 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      write(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function write(doc: PDFKit.PDFDocument, c: LandContractInput) {
  doc.font('Helvetica-Bold').fontSize(14).text('PURCHASE AND SALE AGREEMENT', { align: 'center' });
  doc.font('Helvetica').fontSize(8.5).text(`Effective date: ${fmtDate(c.effectiveDate)}`, { align: 'center' });
  doc.moveDown(0.8);

  doc.fontSize(10);
  doc
    .font('Helvetica')
    .text(
      `${c.buyerName}, Buyer and/or assigns ("Buyer"), agrees to purchase, and/or assign from ` +
        `Seller(s): ${c.sellerNames} ("Seller"), the following described real estate, together with ` +
        `all improvements thereon and all appurtenant rights, located at:`,
      { align: 'justify' }
    );
  doc.moveDown(0.5);

  fieldLine(doc, 'Address', c.address);
  fieldLine(doc, 'Parcel ID', c.parcelId);
  fieldLine(doc, 'Legal Description', c.legalDescription);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Seller agrees:');
  doc.moveDown(0.3);
  doc.font('Helvetica');

  numbered(doc, '1.', `The purchase price is to be ${fmtMoney(c.purchasePrice)}.`);
  numbered(doc, '2.', 'The conditions of this Purchase are as follows:');
  lettered(
    doc,
    'a.',
    'Property is sold in "AS-IS CONDITION" with no warranties made by the Seller. Seller will make ' +
      'the Buyer aware of any known facts that affect the value of the property.'
  );
  lettered(
    doc,
    'b.',
    `If the property does not pass inspection standards during the feasibility study period, or upon any ` +
      `unknown defaults, the Buyer shall be released from any further obligation under this contract. The ` +
      `feasibility study will continue for a period of ${c.feasibilityDays} days from the effective date.`
  );
  lettered(
    doc,
    'c.',
    'If Seller cannot provide a clear title, or does not allow a feasibility study, Buyer will be ' +
      'released from any further obligation under this contract.'
  );
  lettered(
    doc,
    'd.',
    `Closing Agent: ${c.closingAgentName}${c.closingAgentAddress ? `, located at ${c.closingAgentAddress}` : ''}.` +
      `${c.closingDate ? ` Closing on or before ${fmtDate(c.closingDate)}.` : ''}`
  );
  numbered(
    doc,
    '3.',
    `In consideration of the sum of ${fmtMoney(c.earnestMoney)}, Earnest Money will be deposited by ` +
      `Buyer and held at the Closing Agent's office.`
  );
  numbered(doc, '4.', 'Buyer to pay all title-related charges, closing fees, recording fees, and documentary stamps.');
  if (c.specialTerms) numbered(doc, '5.', `Special terms: ${c.specialTerms}`);

  doc.moveDown(1);

  // Signature block — kept compact so the whole agreement stays on 1 page.
  sig(doc, `Seller: ${c.sellerNames}`);
  doc.moveDown(0.8);
  sig(doc, `Buyer: ${c.buyerName}, Buyer and/or assigns`);

  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#333')
    .text(
      'TEMPLATE ONLY — NOT LEGAL ADVICE. Real-estate contract requirements vary by state. Have a licensed ' +
        'local real-estate attorney review this document before use.',
      { align: 'center' }
    )
    .fillColor('#000');
}

// The buyer-side contract: assigns the seller P&S agreement to the
// builder. The assignment fee is paid to the assignor AT CLOSING, through
// the closing agent — the title company holds the original agreement,
// this assignment, and all deposits in escrow, which is what protects
// both contracts (and everyone's money) until the deal funds.
export function renderAssignmentContractPdf(input: AssignmentContractInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 40, left: 60, right: 60 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      writeAssignment(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function writeAssignment(doc: PDFKit.PDFDocument, c: AssignmentContractInput) {
  doc.font('Helvetica-Bold').fontSize(14).text('ASSIGNMENT OF PURCHASE AND SALE AGREEMENT', { align: 'center' });
  doc.font('Helvetica').fontSize(8.5).text(`Effective date: ${fmtDate(c.effectiveDate)}`, { align: 'center' });
  doc.moveDown(0.8);

  doc.fontSize(10);
  doc
    .font('Helvetica')
    .text(
      `${c.assignorName} ("Assignor") hereby assigns and transfers to ${c.assigneeName} ("Assignee") ` +
        `all of Assignor's rights, title, and interest as Buyer under that certain Purchase and Sale ` +
        `Agreement dated ${fmtDate(c.originalAgreementDate)} between Assignor, as Buyer and/or assigns, ` +
        `and ${c.sellerNames}, as Seller ("the Agreement"), for the real estate located at:`,
      { align: 'justify' }
    );
  doc.moveDown(0.5);

  fieldLine(doc, 'Address', c.address);
  fieldLine(doc, 'Parcel ID', c.parcelId);
  fieldLine(doc, 'Legal Description', c.legalDescription);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('The parties agree:');
  doc.moveDown(0.3);
  doc.font('Helvetica');

  numbered(
    doc,
    '1.',
    `Assignee shall pay Assignor an assignment fee of ${fmtMoney(c.assignmentFee)}, due and payable at ` +
      `closing, disbursed by the Closing Agent from closing proceeds.`
  );
  numbered(
    doc,
    '2.',
    `Assignee assumes and agrees to perform all of Buyer's obligations under the Agreement, including ` +
      `payment of the ${fmtMoney(c.originalPrice)} purchase price to Seller and all title-related charges, ` +
      `closing fees, recording fees, and documentary stamps.`
  );
  numbered(
    doc,
    '3.',
    `Closing shall be conducted by ${c.closingAgentName}` +
      `${c.closingAgentAddress ? `, located at ${c.closingAgentAddress}` : ''} ("Closing Agent"), who shall ` +
      `hold the Agreement, this Assignment, and all deposits in escrow and administer all disbursements` +
      `${c.closingDate ? `. Closing on or before ${fmtDate(c.closingDate)}` : ''}.`
  );
  numbered(
    doc,
    '4.',
    'If closing does not occur under the terms of the Agreement, this Assignment is void and neither ' +
      'party shall have any further obligation to the other, except return of any deposits per the Agreement.'
  );
  if (c.specialTerms) numbered(doc, '5.', `Special terms: ${c.specialTerms}`);

  doc.moveDown(1);
  sig(doc, `Assignor: ${c.assignorName}`);
  doc.moveDown(0.8);
  sig(doc, `Assignee: ${c.assigneeName}`);

  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#333')
    .text(
      'TEMPLATE ONLY — NOT LEGAL ADVICE. Real-estate contract requirements vary by state. Have a licensed ' +
        'local real-estate attorney review this document before use.',
      { align: 'center' }
    )
    .fillColor('#000');
}

function fieldLine(doc: PDFKit.PDFDocument, label: string, value?: string) {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${label}: `, { continued: true })
    .font('Helvetica')
    .text(value?.trim() ? value : '________________________________________________');
}

function numbered(doc: PDFKit.PDFDocument, n: string, text: string) {
  doc.font('Helvetica').fontSize(10).text(`${n}  ${text}`, { align: 'justify', indent: 0 });
  doc.moveDown(0.25);
}

function lettered(doc: PDFKit.PDFDocument, letter: string, text: string) {
  doc.font('Helvetica').fontSize(10).text(`${letter}  ${text}`, {
    align: 'justify',
    indent: 18,
  });
  doc.moveDown(0.25);
}

function sig(doc: PDFKit.PDFDocument, who: string) {
  doc.font('Helvetica').fontSize(10);
  doc.text('Signature: ____________________________________    Date: ______________');
  doc.font('Helvetica').fontSize(9).fillColor('#444').text(who).fillColor('#000');
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$________';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  if (!iso) return '____________';
  // Parse Y-M-D by hand: `new Date('YYYY-MM-DD')` is UTC midnight, which
  // toLocaleDateString renders as the PREVIOUS day in negative-offset
  // timezones — an off-by-one on a legal document.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
