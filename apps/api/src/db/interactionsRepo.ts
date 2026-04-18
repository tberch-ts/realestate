import { pool } from './pool.js';

export type InteractionKind = 'call' | 'email' | 'meeting' | 'note' | 'outreach_sent' | 'reply_received';

export interface Interaction {
  id: number;
  contactId: number;
  occurredAt: string;
  kind: InteractionKind;
  subject?: string;
  body?: string;
  createdAt: string;
}

export interface InteractionCreate {
  contactId: number;
  occurredAt?: string;
  kind: InteractionKind;
  subject?: string;
  body?: string;
}

interface Row {
  id: number | string;
  contact_id: number | string;
  occurred_at: Date;
  kind: InteractionKind;
  subject: string | null;
  body: string | null;
  created_at: Date;
}

function toInteraction(r: Row): Interaction {
  return {
    id: Number(r.id),
    contactId: Number(r.contact_id),
    occurredAt: r.occurred_at.toISOString(),
    kind: r.kind,
    subject: r.subject ?? undefined,
    body: r.body ?? undefined,
    createdAt: r.created_at.toISOString(),
  };
}

export async function createInteraction(input: InteractionCreate): Promise<Interaction> {
  const res = await pool.query<Row>(
    `INSERT INTO interactions (contact_id, occurred_at, kind, subject, body)
     VALUES ($1, COALESCE($2, now()), $3, $4, $5)
     RETURNING *`,
    [input.contactId, input.occurredAt ?? null, input.kind, input.subject ?? null, input.body ?? null],
  );
  return toInteraction(res.rows[0]);
}

export async function listInteractionsForContact(contactId: number, limit = 100): Promise<Interaction[]> {
  const res = await pool.query<Row>(
    `SELECT * FROM interactions WHERE contact_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
    [contactId, limit],
  );
  return res.rows.map(toInteraction);
}

export async function deleteInteraction(id: number): Promise<boolean> {
  const res = await pool.query(`DELETE FROM interactions WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
