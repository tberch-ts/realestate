import { Router } from 'express';
import type { LoiDraftCreate, LoiDraftPatch } from '@mfa/shared';
import {
  createDraft,
  deleteDraft,
  getDraft,
  listDrafts,
  updateDraft,
} from '../db/loiDraftsRepo.js';

export const loiDraftsRouter = Router();

loiDraftsRouter.get('/', async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined) as
      | 'draft'
      | 'sent'
      | 'archived'
      | 'all'
      | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const drafts = await listDrafts({ status, limit });
    res.json({ data: drafts });
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const draft = await getDraft(id);
    if (!draft) return res.status(404).json({ error: 'not_found' });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as LoiDraftCreate;
    if (!body?.address || !body?.loi || !body?.dealContext) {
      return res.status(400).json({ error: 'address, loi, and dealContext required' });
    }
    const draft = await createDraft(body);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const patch = req.body as LoiDraftPatch;
    const draft = await updateDraft(id, patch);
    if (!draft) return res.status(404).json({ error: 'not_found' });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const ok = await deleteDraft(id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
