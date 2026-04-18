import { pool } from './pool.js';

export type ContactKind = 'person' | 'firm';
export type ContactSource = 'manual' | 'form_d' | 'portfolio' | 'owner' | 'loi';
export type ContactStatus = 'active' | 'archived';

export interface Contact {
  id: number;
  kind: ContactKind;
  name: string;
  firmName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateCode?: string;
  zip?: string;
  notes?: string;
  source: ContactSource;
  sourceRef?: string;
  tags: string[];
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCreate {
  kind: ContactKind;
  name: string;
  firmName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateCode?: string;
  zip?: string;
  notes?: string;
  source?: ContactSource;
  sourceRef?: string;
  tags?: string[];
}

export type ContactPatch = Partial<ContactCreate> & { status?: ContactStatus };

interface ContactRow {
  id: number | string;
  kind: ContactKind;
  name: string;
  firm_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_code: string | null;
  zip: string | null;
  notes: string | null;
  source: ContactSource;
  source_ref: string | null;
  tags: string[];
  status: ContactStatus;
  created_at: Date;
  updated_at: Date;
}

function rowToContact(r: ContactRow): Contact {
  return {
    id: Number(r.id),
    kind: r.kind,
    name: r.name,
    firmName: r.firm_name ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    addressLine1: r.address_line1 ?? undefined,
    addressLine2: r.address_line2 ?? undefined,
    city: r.city ?? undefined,
    stateCode: r.state_code ?? undefined,
    zip: r.zip ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source,
    sourceRef: r.source_ref ?? undefined,
    tags: r.tags ?? [],
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function createContact(input: ContactCreate): Promise<Contact> {
  const res = await pool.query<ContactRow>(
    `INSERT INTO contacts
       (kind, name, firm_name, email, phone, address_line1, address_line2, city, state_code, zip,
        notes, source, source_ref, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.kind,
      input.name,
      input.firmName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      input.city ?? null,
      input.stateCode ?? null,
      input.zip ?? null,
      input.notes ?? null,
      input.source ?? 'manual',
      input.sourceRef ?? null,
      input.tags ?? [],
    ],
  );
  return rowToContact(res.rows[0]);
}

export async function getContact(id: number): Promise<Contact | null> {
  const res = await pool.query<ContactRow>(`SELECT * FROM contacts WHERE id = $1`, [id]);
  return res.rows[0] ? rowToContact(res.rows[0]) : null;
}

export async function findContactBySource(source: ContactSource, sourceRef: string): Promise<Contact | null> {
  const res = await pool.query<ContactRow>(
    `SELECT * FROM contacts WHERE source = $1 AND source_ref = $2 LIMIT 1`,
    [source, sourceRef],
  );
  return res.rows[0] ? rowToContact(res.rows[0]) : null;
}

export interface ListContactsOpts {
  status?: ContactStatus | 'all';
  source?: ContactSource;
  search?: string;
  limit?: number;
}

export async function listContacts(opts: ListContactsOpts = {}): Promise<Contact[]> {
  const { status = 'active', source, search, limit = 200 } = opts;
  const wheres: string[] = [];
  const params: unknown[] = [];
  if (status !== 'all') { params.push(status); wheres.push(`status = $${params.length}`); }
  if (source)           { params.push(source); wheres.push(`source = $${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    wheres.push(`(lower(name) LIKE $${params.length} OR lower(firm_name) LIKE $${params.length})`);
  }
  params.push(limit);
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const res = await pool.query<ContactRow>(
    `SELECT * FROM contacts ${where} ORDER BY updated_at DESC LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(rowToContact);
}

export async function patchContact(id: number, patch: ContactPatch): Promise<Contact | null> {
  // Map TS field names to column names.
  const map: Record<string, string> = {
    kind: 'kind', name: 'name', firmName: 'firm_name', email: 'email', phone: 'phone',
    addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
    stateCode: 'state_code', zip: 'zip', notes: 'notes', source: 'source',
    sourceRef: 'source_ref', tags: 'tags', status: 'status',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col || v === undefined) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length === 0) return getContact(id);
  sets.push(`updated_at = now()`);
  params.push(id);
  const res = await pool.query<ContactRow>(
    `UPDATE contacts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return res.rows[0] ? rowToContact(res.rows[0]) : null;
}

export async function deleteContact(id: number): Promise<boolean> {
  const res = await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
