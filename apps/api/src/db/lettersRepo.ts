import { pool } from './pool.js';

export interface Letter {
  id: number;
  contactId?: number;
  interactionId?: number;
  dealId?: number;
  draftId?: number;
  provider: string;
  providerId?: string;
  live: boolean;
  subject?: string;
  html?: string;
  pdfUrl?: string;
  status: string;
  carrierTracking?: unknown;
  sendDate?: string;
  expectedDelivery?: string;
  senderSnapshot?: unknown;
  recipientSnapshot?: unknown;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: number | string;
  contact_id: number | string | null;
  interaction_id: number | string | null;
  deal_id: number | string | null;
  draft_id: number | string | null;
  provider: string;
  provider_id: string | null;
  live: boolean;
  subject: string | null;
  html: string | null;
  pdf_url: string | null;
  status: string;
  carrier_tracking: unknown;
  send_date: Date | null;
  expected_delivery: Date | string | null;
  sender_snapshot: unknown;
  recipient_snapshot: unknown;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

function toLetter(r: Row): Letter {
  return {
    id: Number(r.id),
    contactId: r.contact_id == null ? undefined : Number(r.contact_id),
    interactionId: r.interaction_id == null ? undefined : Number(r.interaction_id),
    dealId: r.deal_id == null ? undefined : Number(r.deal_id),
    draftId: r.draft_id == null ? undefined : Number(r.draft_id),
    provider: r.provider,
    providerId: r.provider_id ?? undefined,
    live: r.live,
    subject: r.subject ?? undefined,
    html: r.html ?? undefined,
    pdfUrl: r.pdf_url ?? undefined,
    status: r.status,
    carrierTracking: r.carrier_tracking ?? undefined,
    sendDate: r.send_date ? r.send_date.toISOString() : undefined,
    expectedDelivery: r.expected_delivery
      ? (typeof r.expected_delivery === 'string' ? r.expected_delivery : r.expected_delivery.toISOString().slice(0, 10))
      : undefined,
    senderSnapshot: r.sender_snapshot ?? undefined,
    recipientSnapshot: r.recipient_snapshot ?? undefined,
    errorMessage: r.error_message ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateLetterRecord {
  contactId?: number;
  interactionId?: number;
  dealId?: number;
  draftId?: number;
  provider?: string;
  providerId?: string;
  live?: boolean;
  subject?: string;
  html?: string;
  pdfUrl?: string;
  status: string;
  carrierTracking?: unknown;
  sendDate?: string;
  expectedDelivery?: string;
  senderSnapshot?: unknown;
  recipientSnapshot?: unknown;
  errorMessage?: string;
}

export async function createLetterRecord(input: CreateLetterRecord): Promise<Letter> {
  const res = await pool.query<Row>(
    `INSERT INTO letters
       (contact_id, interaction_id, deal_id, draft_id, provider, provider_id, live,
        subject, html, pdf_url, status, carrier_tracking, send_date, expected_delivery,
        sender_snapshot, recipient_snapshot, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      input.contactId ?? null,
      input.interactionId ?? null,
      input.dealId ?? null,
      input.draftId ?? null,
      input.provider ?? 'postgrid',
      input.providerId ?? null,
      input.live ?? false,
      input.subject ?? null,
      input.html ?? null,
      input.pdfUrl ?? null,
      input.status,
      input.carrierTracking == null ? null : JSON.stringify(input.carrierTracking),
      input.sendDate ?? null,
      input.expectedDelivery ?? null,
      input.senderSnapshot == null ? null : JSON.stringify(input.senderSnapshot),
      input.recipientSnapshot == null ? null : JSON.stringify(input.recipientSnapshot),
      input.errorMessage ?? null,
    ],
  );
  return toLetter(res.rows[0]);
}

export async function listLettersForContact(contactId: number): Promise<Letter[]> {
  const res = await pool.query<Row>(
    `SELECT * FROM letters WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [contactId],
  );
  return res.rows.map(toLetter);
}

export async function updateLetterStatus(
  providerId: string,
  status: string,
  carrierTracking?: unknown,
): Promise<void> {
  await pool.query(
    `UPDATE letters
       SET status = $2,
           carrier_tracking = COALESCE($3::jsonb, carrier_tracking),
           updated_at = now()
     WHERE provider_id = $1`,
    [providerId, status, carrierTracking == null ? null : JSON.stringify(carrierTracking)],
  );
}
