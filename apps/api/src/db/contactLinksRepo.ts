import { pool } from './pool.js';

export type PropertyRelation = 'owner' | 'prospect' | 'broker' | 'seller' | 'buyer' | 'other';
export type FilingRelation = 'issuer' | 'promoter' | 'officer' | 'director' | 'other';

export async function linkContactProperty(
  contactId: number,
  propertyRef: string,
  relation: PropertyRelation,
  notes?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO contact_properties (contact_id, property_ref, relation, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (contact_id, property_ref, relation) DO NOTHING`,
    [contactId, propertyRef, relation, notes ?? null],
  );
}

export async function unlinkContactProperty(
  contactId: number,
  propertyRef: string,
  relation: PropertyRelation,
): Promise<void> {
  await pool.query(
    `DELETE FROM contact_properties WHERE contact_id = $1 AND property_ref = $2 AND relation = $3`,
    [contactId, propertyRef, relation],
  );
}

export interface PropertyLink {
  contactId: number;
  propertyRef: string;
  relation: PropertyRelation;
  notes?: string;
}

export async function listPropertiesForContact(contactId: number): Promise<PropertyLink[]> {
  const res = await pool.query(
    `SELECT contact_id, property_ref, relation, notes
       FROM contact_properties WHERE contact_id = $1 ORDER BY created_at DESC`,
    [contactId],
  );
  return res.rows.map((r: { contact_id: number | string; property_ref: string; relation: PropertyRelation; notes: string | null }) => ({
    contactId: Number(r.contact_id),
    propertyRef: r.property_ref,
    relation: r.relation,
    notes: r.notes ?? undefined,
  }));
}

export async function listContactsForProperty(propertyRef: string): Promise<PropertyLink[]> {
  const res = await pool.query(
    `SELECT contact_id, property_ref, relation, notes
       FROM contact_properties WHERE property_ref = $1`,
    [propertyRef],
  );
  return res.rows.map((r: { contact_id: number | string; property_ref: string; relation: PropertyRelation; notes: string | null }) => ({
    contactId: Number(r.contact_id),
    propertyRef: r.property_ref,
    relation: r.relation,
    notes: r.notes ?? undefined,
  }));
}

export async function linkContactFiling(
  contactId: number,
  accessionNumber: string,
  cik: string | undefined,
  relation: FilingRelation,
  notes?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO contact_filings (contact_id, accession_number, cik, relation, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contact_id, accession_number, relation) DO NOTHING`,
    [contactId, accessionNumber, cik ?? null, relation, notes ?? null],
  );
}

export interface FilingLink {
  contactId: number;
  accessionNumber: string;
  cik?: string;
  relation: FilingRelation;
  notes?: string;
}

export async function listFilingsForContact(contactId: number): Promise<FilingLink[]> {
  const res = await pool.query(
    `SELECT contact_id, accession_number, cik, relation, notes
       FROM contact_filings WHERE contact_id = $1 ORDER BY created_at DESC`,
    [contactId],
  );
  return res.rows.map((r: { contact_id: number | string; accession_number: string; cik: string | null; relation: FilingRelation; notes: string | null }) => ({
    contactId: Number(r.contact_id),
    accessionNumber: r.accession_number,
    cik: r.cik ?? undefined,
    relation: r.relation,
    notes: r.notes ?? undefined,
  }));
}
