import type {
  LoiDealContext,
  LoiDraft,
  LoiDraftCreate,
  LoiDraftPatch,
  LoiDraftStatus,
  LoiInput,
} from '@mfa/shared';
import { pool } from './pool.js';

// All read/write operations are scoped to a Firebase user id. Callers
// MUST pass userId — there is no "all users" view. Cross-user reads
// return null (handled as 404 in the route layer to avoid leaking
// existence). Cross-user updates/deletes are no-ops returning null/false.
//
// userId is the Firebase Auth `uid` claim from the verified ID token,
// stored as TEXT (Firebase UIDs are 28-char base62 strings).

interface Row {
  id: string;
  user_id: string | null;
  address: string;
  deal_id: string | null;
  property_id: string | null;
  data: { loi: LoiInput; dealContext: LoiDealContext };
  status: LoiDraftStatus;
  created_at: Date;
  updated_at: Date;
}

function toDraft(r: Row): LoiDraft {
  return {
    id: Number(r.id),
    address: r.address,
    dealId: r.deal_id ? Number(r.deal_id) : undefined,
    propertyId: r.property_id ? Number(r.property_id) : undefined,
    loi: r.data.loi,
    dealContext: r.data.dealContext,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function createDraft(userId: string, input: LoiDraftCreate): Promise<LoiDraft> {
  const payload = { loi: input.loi, dealContext: input.dealContext };
  const { rows } = await pool.query<Row>(
    `INSERT INTO loi_drafts (user_id, address, deal_id, property_id, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, input.address, input.dealId ?? null, input.propertyId ?? null, payload]
  );
  return toDraft(rows[0]);
}

/**
 * Fetch a single draft, but only if it belongs to this user. Returns null
 * for both "doesn't exist" and "exists but belongs to someone else" — the
 * route layer maps both to 404 so we don't reveal whether an id is taken.
 */
export async function getDraft(userId: string, id: number): Promise<LoiDraft | null> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM loi_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function listDrafts(
  userId: string,
  opts: {
    status?: LoiDraftStatus | 'all';
    limit?: number;
  } = {}
): Promise<LoiDraft[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const status = opts.status ?? 'draft';
  // Always filter by user_id; status filter is optional.
  // Pre-migration rows have NULL user_id and are invisible to everyone.
  const params: (string | number)[] = [userId, limit];
  let where = `WHERE user_id = $1`;
  if (status !== 'all') {
    where += ` AND status = $3`;
    params.push(status);
  }
  const { rows } = await pool.query<Row>(
    `SELECT * FROM loi_drafts ${where} ORDER BY updated_at DESC LIMIT $2`,
    params
  );
  return rows.map(toDraft);
}

export async function updateDraft(
  userId: string,
  id: number,
  patch: LoiDraftPatch
): Promise<LoiDraft | null> {
  // Load owned row first — merges existing data and enforces ownership in
  // a single round-trip. If the user doesn't own it, getDraft returns null
  // and we never run the UPDATE.
  const existing = await getDraft(userId, id);
  if (!existing) return null;
  const nextLoi = patch.loi ?? existing.loi;
  const nextCtx = patch.dealContext ?? existing.dealContext;
  const nextStatus = patch.status ?? existing.status;
  const payload = { loi: nextLoi, dealContext: nextCtx };
  // user_id is also re-checked in the WHERE clause as defense-in-depth,
  // in case the row's owner changed between the SELECT and UPDATE.
  const { rows } = await pool.query<Row>(
    `UPDATE loi_drafts
        SET data = $1, status = $2, updated_at = now()
      WHERE id = $3 AND user_id = $4
      RETURNING *`,
    [payload, nextStatus, id, userId]
  );
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function deleteDraft(userId: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM loi_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}
