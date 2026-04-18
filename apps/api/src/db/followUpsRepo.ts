import { pool } from './pool.js';

export type FollowUpStatus = 'open' | 'done' | 'skipped' | 'snoozed';

export interface FollowUp {
  id: number;
  contactId: number;
  dueDate: string;           // YYYY-MM-DD
  subject: string;
  notes?: string;
  status: FollowUpStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  contactName?: string;       // populated by joined list
}

export interface FollowUpCreate {
  contactId: number;
  dueDate: string;
  subject: string;
  notes?: string;
}

export type FollowUpPatch = Partial<FollowUpCreate> & { status?: FollowUpStatus };

interface Row {
  id: number | string;
  contact_id: number | string;
  due_date: Date | string;
  subject: string;
  notes: string | null;
  status: FollowUpStatus;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  contact_name?: string;
}

function dateOnly(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toFollowUp(r: Row): FollowUp {
  return {
    id: Number(r.id),
    contactId: Number(r.contact_id),
    dueDate: dateOnly(r.due_date),
    subject: r.subject,
    notes: r.notes ?? undefined,
    status: r.status,
    completedAt: r.completed_at ? r.completed_at.toISOString() : undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    contactName: r.contact_name,
  };
}

export async function createFollowUp(input: FollowUpCreate): Promise<FollowUp> {
  const res = await pool.query<Row>(
    `INSERT INTO follow_ups (contact_id, due_date, subject, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.contactId, input.dueDate, input.subject, input.notes ?? null],
  );
  return toFollowUp(res.rows[0]);
}

export interface ListFollowUpsOpts {
  status?: FollowUpStatus | 'all';
  contactId?: number;
  dueBefore?: string; // YYYY-MM-DD
  limit?: number;
}

export async function listFollowUps(opts: ListFollowUpsOpts = {}): Promise<FollowUp[]> {
  const { status = 'open', contactId, dueBefore, limit = 200 } = opts;
  const wheres: string[] = [];
  const params: unknown[] = [];
  if (status !== 'all') { params.push(status); wheres.push(`f.status = $${params.length}`); }
  if (contactId)        { params.push(contactId); wheres.push(`f.contact_id = $${params.length}`); }
  if (dueBefore)        { params.push(dueBefore); wheres.push(`f.due_date <= $${params.length}`); }
  params.push(limit);
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const res = await pool.query<Row>(
    `SELECT f.*, c.name AS contact_name
       FROM follow_ups f
       JOIN contacts   c ON c.id = f.contact_id
      ${where}
      ORDER BY f.due_date ASC, f.id ASC
      LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(toFollowUp);
}

export async function patchFollowUp(id: number, patch: FollowUpPatch): Promise<FollowUp | null> {
  const map: Record<string, string> = {
    contactId: 'contact_id', dueDate: 'due_date', subject: 'subject',
    notes: 'notes', status: 'status',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col || v === undefined) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (patch.status === 'done') sets.push(`completed_at = now()`);
  if (sets.length === 0) return getFollowUp(id);
  sets.push(`updated_at = now()`);
  params.push(id);
  const res = await pool.query<Row>(
    `UPDATE follow_ups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return res.rows[0] ? toFollowUp(res.rows[0]) : null;
}

export async function getFollowUp(id: number): Promise<FollowUp | null> {
  const res = await pool.query<Row>(`SELECT * FROM follow_ups WHERE id = $1`, [id]);
  return res.rows[0] ? toFollowUp(res.rows[0]) : null;
}

export async function deleteFollowUp(id: number): Promise<boolean> {
  const res = await pool.query(`DELETE FROM follow_ups WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
