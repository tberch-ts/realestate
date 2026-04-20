import { Router, type Request, type Response, type NextFunction } from 'express';
import type { LoiDraftCreate, LoiDraftPatch } from '@mfa/shared';
import {
  createDraft,
  deleteDraft,
  getDraft,
  listDrafts,
  updateDraft,
} from '../db/loiDraftsRepo.js';

export const loiDraftsRouter = Router();

/**
 * Per-route auth gate: every LOI draft endpoint requires a verified
 * Firebase user. The global firebaseAuth middleware (in `index.ts`)
 * runs first and attaches `req.firebaseUser` if a Bearer token was
 * present and valid. If we get here without one (e.g. the request came
 * in via the basic-auth path in AUTH_MODE=both), bail with 401 — LOI
 * drafts are personal data and basic-auth is shared by everyone using
 * the same password.
 */
function requireFirebaseUser(req: Request, res: Response, next: NextFunction): void {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    res.status(401).json({
      error: 'unauthorized',
      message:
        'LOI drafts require a Firebase Bearer token. Sign in with Google through the TalkStudio frontend; basic-auth is not sufficient because drafts are per-user.',
    });
    return;
  }
  next();
}

loiDraftsRouter.use(requireFirebaseUser);

loiDraftsRouter.get('/', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const status = (req.query.status as string | undefined) as
      | 'draft'
      | 'sent'
      | 'archived'
      | 'all'
      | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const drafts = await listDrafts(uid, { status, limit });
    res.json({ data: drafts });
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.get('/:id', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const draft = await getDraft(uid, id);
    // 404 (not 403) for cross-user reads — we don't want to confirm that
    // a draft id exists but belongs to someone else.
    if (!draft) return res.status(404).json({ error: 'not_found' });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.post('/', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const body = req.body as LoiDraftCreate;
    if (!body?.address || !body?.loi || !body?.dealContext) {
      return res.status(400).json({ error: 'address, loi, and dealContext required' });
    }
    const draft = await createDraft(uid, body);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.patch('/:id', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const patch = req.body as LoiDraftPatch;
    const draft = await updateDraft(uid, id, patch);
    if (!draft) return res.status(404).json({ error: 'not_found' });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

loiDraftsRouter.delete('/:id', async (req, res, next) => {
  try {
    const uid = req.firebaseUser!.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const ok = await deleteDraft(uid, id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
