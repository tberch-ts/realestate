import PDFDocument from 'pdfkit';
import type { DealInput, LoiInput } from '@mfa/shared';

// Generate a Colorado multifamily LOI as a PDF buffer.
// Non-binding letter — includes standard disclaimer.
export function renderLoiPdf(deal: DealInput, loi: LoiInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 72 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      write(doc, deal, loi);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function write(doc: PDFKit.PDFDocument, deal: DealInput, loi: LoiInput) {
  const price = deal.underwriting.purchasePrice;
  const units = deal.underwriting.units;

  // Header
  doc.font('Helvetica-Bold').fontSize(16).text('LETTER OF INTENT', { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text('Non-binding · For discussion purposes only', { align: 'center' });
  doc.moveDown(1.5);

  // Parties line
  doc.fontSize(11);
  keyLine(doc, 'Effective date', fmtDate(loi.effectiveDate));
  keyLine(doc, 'Expiration', fmtDate(loi.expirationDate));
  keyLine(doc, 'Prepared by', loi.buyerContact ?? loi.buyerEntity);
  doc.moveDown();

  // Intro paragraph
  para(
    doc,
    `This Letter of Intent (this "LOI") sets forth the general terms and conditions under ` +
      `which ${loi.buyerEntity} ("Buyer") proposes to acquire the real property commonly known as ` +
      `${deal.address} (the "Property") from ${loi.sellerEntity} ("Seller"). This LOI is non-binding ` +
      `on either party except as expressly stated in Section 12 below.`
  );

  // Numbered sections
  section(doc, '1. Parties');
  kv(doc, 'Buyer', loi.buyerEntity);
  if (loi.buyerContact) kv(doc, '  Contact', loi.buyerContact);
  if (loi.buyerAddress) kv(doc, '  Address', loi.buyerAddress);
  if (loi.buyerEmail) kv(doc, '  Email', loi.buyerEmail);
  if (loi.buyerPhone) kv(doc, '  Phone', loi.buyerPhone);
  kv(doc, 'Seller', loi.sellerEntity);
  if (loi.sellerContact) kv(doc, '  Contact', loi.sellerContact);
  if (loi.sellerAddress) kv(doc, '  Address', loi.sellerAddress);

  section(doc, '2. Property');
  kv(doc, 'Address', deal.address);
  kv(doc, 'Units', String(units));
  if (deal.name) kv(doc, 'Project name', deal.name);
  if (deal.assetClass && deal.assetClass !== 'unknown') kv(doc, 'Asset class', deal.assetClass);

  section(doc, '3. Purchase price');
  kv(doc, 'Purchase price', fmtMoney(price));
  kv(doc, 'Price per unit', fmtMoney(units > 0 ? price / units : 0));

  section(doc, '4. Earnest money deposit');
  para(
    doc,
    `Within three (3) business days after execution of a definitive Purchase and Sale Agreement ` +
      `("PSA"), Buyer shall deposit ${fmtMoney(loi.earnestMoney)} (the "Earnest Money") with a ` +
      `mutually acceptable title company. ${
        loi.additionalDeposit && loi.additionalDeposit > 0
          ? `Upon expiration of the Inspection Period, Buyer shall deposit an additional ${fmtMoney(
              loi.additionalDeposit
            )} with the title company.`
          : ''
      } The Earnest Money shall be ${
        loi.earnestMoneyRefundable ? 'refundable' : 'non-refundable'
      } upon expiration of the Inspection Period, except in the event of Seller default.`
  );

  section(doc, '5. Inspection period');
  para(
    doc,
    `Buyer shall have ${loi.inspectionDays} days following the Effective Date of the PSA (the ` +
      `"Inspection Period") to complete its physical, financial, legal, and environmental due ` +
      `diligence. During the Inspection Period, Buyer may terminate the PSA for any reason or no ` +
      `reason whatsoever and receive a full refund of the Earnest Money.`
  );

  if (loi.ddMaterials.length > 0) {
    section(doc, '6. Due diligence materials');
    para(
      doc,
      'Within five (5) business days after execution of the PSA, Seller shall deliver the following:'
    );
    bulletList(doc, loi.ddMaterials);
  }

  section(doc, '7. Title');
  para(
    doc,
    `Within ${loi.titleReviewDays} days of the Effective Date of the PSA, Buyer shall receive a ` +
      `title commitment and related exception documents. Buyer shall have ten (10) days thereafter ` +
      `to object to any exceptions. Seller shall convey title by special warranty deed free of all ` +
      `objected-to exceptions other than Permitted Exceptions.`
  );

  if (loi.financingContingency) {
    section(doc, '8. Financing');
    const finDays = loi.financingDays ?? 45;
    para(
      doc,
      `The PSA shall include a ${finDays}-day financing contingency period running concurrent with ` +
        `the Inspection Period, during which Buyer shall use commercially reasonable efforts to obtain ` +
        `acquisition financing on terms acceptable to Buyer in its sole discretion.`
    );
  } else {
    section(doc, '8. Financing');
    para(doc, 'There shall be no financing contingency. Buyer represents it is able to close on a cash-equivalent basis.');
  }

  section(doc, '9. Closing');
  para(
    doc,
    `Closing shall occur no later than ${loi.closingDays} days after expiration of the Inspection ` +
      `Period, or such earlier date as the parties may mutually agree.`
  );

  section(doc, '10. Assignment');
  para(
    doc,
    loi.assignmentRights
      ? 'Buyer shall have the right to assign the PSA to an affiliated entity at or prior to closing ' +
          'without Seller consent, provided that the assignee assumes all obligations of Buyer.'
      : 'The PSA shall not be assignable by Buyer without the prior written consent of Seller.'
  );

  if (loi.brokerFee) {
    section(doc, '11. Brokerage');
    para(doc, loi.brokerFee);
  }

  if (loi.specialTerms) {
    section(doc, '12. Special provisions');
    para(doc, loi.specialTerms);
  }

  section(doc, `${loi.brokerFee ? (loi.specialTerms ? '13' : '12') : loi.specialTerms ? '12' : '11'}. Non-binding`);
  para(
    doc,
    'Except for the obligations of confidentiality and exclusivity, if any, and except as the ' +
      'parties may subsequently agree in a fully-executed PSA, this LOI is NON-BINDING on either ' +
      'party and creates no enforceable obligation to proceed to closing. No party shall be bound ' +
      'until a definitive, written PSA is executed and delivered by both Buyer and Seller.'
  );

  // Signature block
  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Acknowledged and agreed:');
  doc.moveDown();
  sigBlock(doc, 'Buyer', loi.buyerEntity, loi.buyerContact);
  doc.moveDown(2);
  sigBlock(doc, 'Seller', loi.sellerEntity, loi.sellerContact);

  // Footer disclaimer
  doc.moveDown(2);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor('#555')
    .text(
      'Generated by MultiFamily Analyzer. This document is a non-binding letter of intent prepared for discussion purposes only. ' +
        'It is not legal advice. Consult qualified Colorado real-estate counsel before relying on or executing.',
      { align: 'center' }
    )
    .fillColor('#000');
}

// ---- helpers ----

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(12).text(title);
  doc.font('Helvetica').fontSize(11);
}

function para(doc: PDFKit.PDFDocument, text: string) {
  doc.font('Helvetica').fontSize(11).text(text, { align: 'justify' });
  doc.moveDown(0.3);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  doc.list(items, { bulletRadius: 2 });
  doc.moveDown(0.3);
}

function kv(doc: PDFKit.PDFDocument, key: string, value: string) {
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(`${key}: `, { continued: true })
    .font('Helvetica')
    .text(value);
}

function keyLine(doc: PDFKit.PDFDocument, key: string, value: string) {
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(`${key}: ${value}`);
}

function sigBlock(doc: PDFKit.PDFDocument, role: string, entity: string, contact?: string) {
  const startY = doc.y;
  doc.font('Helvetica-Bold').text(role + ':');
  doc.font('Helvetica').text(entity);
  doc.moveDown();
  doc.text('Signature: ______________________________________');
  doc.text(contact ? `Name: ${contact}` : 'Name: ________________________________________');
  doc.text('Title:  ________________________________________');
  doc.text('Date:   ________________________________________');
  doc.y;
  void startY; // anchor (could be used for column layout later)
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
