// Pre-filled contract emails. The app uses the user's own mail client
// (mailto:, same pattern as ContactDetail's outreach email) — better
// deliverability and identity than a transactional sender, zero setup.
// mailto can't attach files, so the flow is always: generate/download the
// PDF, then this opens the email and the user attaches it.
//
// Escrow protection: the title company (closing agent) is CC'd on both
// contract emails and gets its own "open escrow" email holding BOTH
// documents — the seller P&S and the builder assignment — plus any
// earnest money, and disbursing the assignment fee at closing. That
// paper trail through a neutral third party is what protects the
// contracts (and everyone's money) until funding.

export interface ContractEmailContext {
  address?: string;
  parcelId?: string;
  senderName?: string;
  titleCompany?: string;
  price?: number;           // seller contract price
  assignmentFee?: number;
  builderName?: string;
  sellerNames?: string;
  feasibilityDays?: number;
}

function mailto(to: string, opts: { cc?: string; subject: string; body: string }): string {
  const p = new URLSearchParams();
  if (opts.cc) p.set('cc', opts.cc);
  p.set('subject', opts.subject);
  p.set('body', opts.body);
  // URLSearchParams encodes spaces as '+', which mail clients render
  // literally — re-encode as %20.
  return `mailto:${encodeURIComponent(to)}?${p.toString().replace(/\+/g, '%20')}`;
}

function propertyLabel(ctx: ContractEmailContext): string {
  return ctx.address || (ctx.parcelId ? `parcel ${ctx.parcelId}` : 'the property');
}

// Seller gets the signed-ready P&S. Title company CC'd so the executed
// copy lands in escrow from the first email.
export function sellerContractEmail(to: string, ctx: ContractEmailContext, ccTitle?: string): string {
  const body =
    `Hi ${ctx.sellerNames || ''},\n\n` +
    `Thank you for talking with me about ${propertyLabel(ctx)}. As discussed, attached is our ` +
    `one-page purchase agreement${ctx.price != null ? ` at ${fmtMoney(ctx.price)}` : ''}.\n\n` +
    `A few things to know:\n` +
    `- You sell as-is; nothing for you to repair or clean up\n` +
    `- I pay all title charges, closing fees, and recording fees — you net the full price\n` +
    `- Closing is handled by ${ctx.titleCompany || 'a licensed local title company'}, a neutral third ` +
    `party that holds all documents and funds in escrow\n\n` +
    `Please sign and reply with the attached agreement (a photo of the signed page works), and the ` +
    `title company will take it from there.\n\n` +
    `Best,\n${ctx.senderName || ''}`;
  return mailto(to, {
    cc: ccTitle,
    subject: `Purchase agreement — ${propertyLabel(ctx)}`,
    body,
  });
}

// Builder gets the assignment referencing their buy box. Title company
// CC'd so fee + obligations are on record with escrow.
export function builderAssignmentEmail(to: string, ctx: ContractEmailContext, ccTitle?: string): string {
  const body =
    `Hi ${ctx.builderName || ''},\n\n` +
    `I have ${propertyLabel(ctx)} under contract and I'm assigning it to you per your buy box. ` +
    `Attached is the one-page assignment` +
    `${ctx.assignmentFee != null ? ` (assignment fee ${fmtMoney(ctx.assignmentFee)}, paid at closing through escrow)` : ''}.\n\n` +
    `${ctx.titleCompany || 'The title company'} is holding the purchase agreement and will hold this ` +
    `assignment and all deposits in escrow; the fee disburses from closing proceeds — no side payments.\n\n` +
    `Please sign and return, and send any questions on the lot my way.\n\n` +
    `Best,\n${ctx.senderName || ''}`;
  return mailto(to, {
    cc: ccTitle,
    subject: `Assignment of contract — ${propertyLabel(ctx)}`,
    body,
  });
}

// The escrow-open email: both contracts to the neutral third party.
export function titleCompanyEmail(to: string, ctx: ContractEmailContext): string {
  const body =
    `Hello,\n\n` +
    `Please open escrow for ${propertyLabel(ctx)}${ctx.parcelId ? ` (Parcel ID ${ctx.parcelId})` : ''}.\n\n` +
    `Attached (or following shortly) are:\n` +
    `1. Purchase and Sale Agreement — Seller: ${ctx.sellerNames || '[seller]'}, Buyer: ` +
    `${ctx.senderName || '[me]'} and/or assigns${ctx.price != null ? `, price ${fmtMoney(ctx.price)}` : ''}\n` +
    `2. Assignment of Contract — Assignee: ${ctx.builderName || '[builder]'}` +
    `${ctx.assignmentFee != null ? `, assignment fee ${fmtMoney(ctx.assignmentFee)} to be disbursed to me at closing` : ''}\n\n` +
    `Please hold both documents and any earnest money in escrow, run title, and administer all ` +
    `disbursements at closing per the documents.\n\n` +
    `Thank you,\n${ctx.senderName || ''}`;
  return mailto(to, {
    subject: `Open escrow — ${propertyLabel(ctx)}`,
    body,
  });
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
