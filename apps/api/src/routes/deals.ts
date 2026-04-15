import { Router } from 'express';
import type { DealInput, DealRecord, UnderwritingInput, ValueAddLever } from '@mfa/shared';
import { pool } from '../db/pool.js';
import { underwrite } from '../underwriting.js';

export const dealsRouter = Router();

// --------- Underwriting preview (no persistence) ---------
dealsRouter.post('/underwrite', (req, res) => {
  try {
    const body = req.body as { underwriting?: UnderwritingInput };
    if (!body?.underwriting) return res.status(400).json({ error: 'underwriting required' });
    const out = underwrite(body.underwriting);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: 'bad_input', message: (err as Error).message });
  }
});

// --------- List ---------
dealsRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.property_id, d.name, d.purchase_price, d.units, d.asset_class,
              d.levers, d.notes, d.status, d.underwriting, d.underwriting_output,
              d.created_at, d.updated_at, p.address
       FROM deals d
       JOIN properties p ON p.id = d.property_id
       ORDER BY d.updated_at DESC`
    );
    res.json(rows.map(rowToDeal));
  } catch (err) {
    res.status(503).json({ error: 'db_unavailable', message: (err as Error).message });
  }
});

// --------- Get one ---------
dealsRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const { rows } = await pool.query(
      `SELECT d.*, p.address FROM deals d JOIN properties p ON p.id = d.property_id WHERE d.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rowToDeal(rows[0]));
  } catch (err) {
    res.status(503).json({ error: 'db_unavailable', message: (err as Error).message });
  }
});

// --------- Create ---------
dealsRouter.post('/', async (req, res) => {
  try {
    const deal = req.body as DealInput;
    if (!deal?.address || !deal?.underwriting) {
      return res.status(400).json({ error: 'address and underwriting required' });
    }
    const output = underwrite(deal.underwriting);
    const propertyId = await ensureProperty(deal.address, deal.propertyId);

    const { rows } = await pool.query(
      `INSERT INTO deals
        (property_id, name, purchase_price, units, asset_class, levers, notes, underwriting, underwriting_output, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, 'draft')
       RETURNING id`,
      [
        propertyId,
        deal.name ?? null,
        deal.underwriting.purchasePrice,
        deal.underwriting.units,
        deal.assetClass ?? null,
        JSON.stringify(deal.levers ?? []),
        deal.notes ?? null,
        JSON.stringify(deal.underwriting),
        JSON.stringify(output),
      ]
    );
    res.status(201).json({ id: rows[0].id, underwritingOutput: output });
  } catch (err) {
    res.status(503).json({ error: 'db_unavailable', message: (err as Error).message });
  }
});

// --------- Update ---------
dealsRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const deal = req.body as DealInput;
    const output = underwrite(deal.underwriting);
    await pool.query(
      `UPDATE deals SET
         name = $1,
         purchase_price = $2,
         units = $3,
         asset_class = $4,
         levers = $5::jsonb,
         notes = $6,
         underwriting = $7::jsonb,
         underwriting_output = $8::jsonb,
         updated_at = now()
       WHERE id = $9`,
      [
        deal.name ?? null,
        deal.underwriting.purchasePrice,
        deal.underwriting.units,
        deal.assetClass ?? null,
        JSON.stringify(deal.levers ?? []),
        deal.notes ?? null,
        JSON.stringify(deal.underwriting),
        JSON.stringify(output),
        id,
      ]
    );
    res.json({ ok: true, underwritingOutput: output });
  } catch (err) {
    res.status(503).json({ error: 'db_unavailable', message: (err as Error).message });
  }
});

async function ensureProperty(address: string, propertyId?: number): Promise<number> {
  if (propertyId) return propertyId;
  const { rows } = await pool.query(
    `INSERT INTO properties (address, normalized)
     VALUES ($1, $2)
     ON CONFLICT (normalized) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [address, address.trim().toLowerCase()]
  );
  return rows[0].id;
}

function rowToDeal(row: Record<string, unknown>): DealRecord {
  return {
    id: Number(row.id),
    propertyId: Number(row.property_id),
    address: String(row.address ?? ''),
    name: (row.name as string) ?? undefined,
    assetClass: (row.asset_class as DealRecord['assetClass']) ?? undefined,
    levers: (row.levers as ValueAddLever[]) ?? [],
    notes: (row.notes as string) ?? undefined,
    status: String(row.status ?? 'draft'),
    underwriting: row.underwriting as UnderwritingInput,
    underwritingOutput: row.underwriting_output as DealRecord['underwritingOutput'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
