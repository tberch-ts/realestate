import type {
  LoiDealContext,
  LoiDraft,
  LoiDraftCreate,
  LoiDraftPatch,
  LoiDraftStatus,
  LoiInput,
} from '@mfa/shared';
import { pool } from './pool.js';

interface Row {
  id: string;
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

export async function createDraft(input: LoiDraftCreate): Promise<LoiDraft> {
  const payload = { loi: input.loi, dealContext: input.dealContext };
  const { rows } = await pool.query<Row>(
    `INSERT INTO loi_drafts (address, deal_id, property_id, data)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.address, input.dealId ?? null, input.propertyId ?? null, payload]
  );
  return toDraft(rows[0]);
}

export async function getDraft(id: number): Promise<LoiDraft | null> {
  const { rows } = await pool.query<Row>(`SELECT * FROM loi_drafts WHERE id = $1`, [id]);
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function listDrafts(opts: {
  status?: LoiDraftStatus | 'all';
  limit?: number;
} = {}): Promise<LoiDraft[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const status = opts.status ?? 'draft';
  const where = status === 'all' ? '' : `WHERE status = $2`;
  const params: (string | number)[] = [limit];
  if (status !== 'all') params.push(status);
  const { rows } = await pool.query<Row>(
    `SELECT * FROM loi_drafts ${where} ORDER BY updated_at DESC LIMIT $1`,
    params
  );
  return rows.map(toDraft);
}

export async function updateDraft(id: number, patch: LoiDraftPatch): Promise<LoiDraft | null> {
  // Load current row to merge `data` payload (since we store both loi + dealContext in one JSONB col)
  const existing = await getDraft(id);
  if (!existing) return null;
  const nextLoi = patch.loi ?? existing.loi;
  const nextCtx = patch.dealContext ?? existing.dealContext;
  const nextStatus = patch.status ?? existing.status;
  const payload = { loi: nextLoi, dealContext: nextCtx };
  const { rows } = await pool.query<Row>(
    `UPDATE loi_drafts
        SET data = $1, status = $2, updated_at = now()
      WHERE id = $3
      RETURNING *`,
    [payload, nextStatus, id]
  );
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function deleteDraft(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM loi_drafts WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
