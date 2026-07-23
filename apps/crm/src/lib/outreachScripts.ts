// Outreach script templates for vacant-lot owners, pre-filled with parcel
// merge fields. Three variants: SMS (short, compliant), call (talk track),
// mail (letter body). Tone: honest, low-pressure, specific — the owner has
// usually held the lot for 10+ years and isn't expecting the text.

export interface ScriptContext {
  ownerFirstName?: string;
  yearsHeld?: number;
  lotAcres?: number;
  areaLabel?: string;     // "Raleigh, NC" / zone / zip
  address?: string;       // situs address if the lot has one
  offerPrice?: number;    // suggested cash offer (builder price − spread)
  senderName?: string;
}

export interface LandScripts {
  sms: string;
  call: string;
  mail: string;
}

export function landScripts(ctx: ScriptContext): LandScripts {
  const name = ctx.ownerFirstName ? capitalize(ctx.ownerFirstName) : 'there';
  const lot = describeLot(ctx);
  const held = ctx.yearsHeld != null && ctx.yearsHeld >= 5 ? `you've owned for ${ctx.yearsHeld}+ years` : `you own`;
  const offer = ctx.offerPrice != null ? fmtMoney(ctx.offerPrice) : undefined;
  const sender = ctx.senderName ?? '[your name]';

  // ≤ ~320 chars, self-identifies, includes opt-out — one-to-one outreach.
  const sms =
    `Hi ${name}, this is ${sender}, a local land buyer. I'm reaching out about ${lot} ${held}` +
    `${ctx.areaLabel ? ` near ${ctx.areaLabel}` : ''}. ` +
    (offer
      ? `I can offer ${offer} cash, as-is, no fees or commissions. `
      : `I'd like to make you a cash offer, as-is, no fees or commissions. `) +
    `Any interest in selling? Reply STOP to opt out.`;

  const call =
    `Hi, is this ${name}? This is ${sender} — I'm a local land buyer, not an agent.\n\n` +
    `The reason I'm calling: I noticed ${lot}${ctx.areaLabel ? ` near ${ctx.areaLabel}` : ''} that ${held}. ` +
    `Builders are actively buying lots in that area right now, and I'm looking to buy a few more.\n\n` +
    `${offer ? `I can pay around ${offer}, cash, ` : `I can pay cash, `}` +
    `close through a local title company, and cover all the closing costs — you'd net the full price, ` +
    `sell as-is, no repairs, no commissions, no listing.\n\n` +
    `Is selling something you'd consider if the number made sense?\n\n` +
    `[If yes] Great — let me confirm a couple of details about the lot and I'll get you a simple ` +
    `one-page agreement to look over. There's a short feasibility period so you have nothing at risk.\n` +
    `[If no] No problem at all — mind if I keep your number and check back in a few months?`;

  const mail =
    `Dear ${name},\n\n` +
    `I'm a local land buyer, and I'm writing about ${lot}${ctx.areaLabel ? ` near ${ctx.areaLabel}` : ''}` +
    `${ctx.address ? ` (${ctx.address})` : ''} that ${held}.\n\n` +
    `Builders are actively buying lots in this area, and I'd like to make you a straightforward ` +
    `cash offer${offer ? ` of ${offer}` : ''}:\n\n` +
    `  • Cash — no financing contingencies\n` +
    `  • As-is — no cleanup, surveys, or repairs needed on your end\n` +
    `  • I pay ALL closing costs, title fees, and recording fees — you net the full price\n` +
    `  • Close at a local, licensed title company on your timeline\n\n` +
    `If you've ever thought about turning that land into cash — taxes, upkeep, or just money ` +
    `sitting idle — this is a simple way to do it with a one-page agreement.\n\n` +
    `Call or text me and I'll answer any questions.\n\n` +
    `Sincerely,\n${sender}`;

  return { sms, call, mail };
}

function describeLot(ctx: ScriptContext): string {
  const acres = ctx.lotAcres != null ? `${trimNum(ctx.lotAcres)}-acre ` : '';
  return `the ${acres}lot`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function trimNum(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// Best-effort first name from assessor owner strings: "SMITH, JOHN A" →
// "John"; "John & Jane Doe" → "John"; LLCs get undefined (scripts fall
// back to "there").
export function ownerFirstName(owner?: string): string | undefined {
  if (!owner) return undefined;
  const o = owner.trim();
  if (/\b(LLC|L L C|INC|CORP|LP|TRUSTEE|PROPERTIES|HOLDINGS)\b/i.test(o) && !/TRUSTEE$/i.test(o)) {
    // Entity names don't have a first name (bare "... Trustee" often does).
    if (!/TRUSTEE/i.test(o)) return undefined;
  }
  const comma = o.split(',');
  if (comma.length >= 2) {
    // "LAST, FIRST MIDDLE" — take the first token after the comma.
    const first = comma[1].trim().split(/\s+/)[0];
    return first && /^[a-zA-Z'-]+$/.test(first) ? first : undefined;
  }
  const first = o.split(/\s+/)[0];
  return first && /^[a-zA-Z'-]+$/.test(first) ? first : undefined;
}
