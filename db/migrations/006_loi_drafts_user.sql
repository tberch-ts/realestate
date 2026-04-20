-- LOI drafts: scope to the user who created them.
--
-- Before this migration, /api/loi/drafts returned every draft in the
-- database to every authed caller — fine for solo-tenant prototyping,
-- but a hard data leak the moment two operators sign in.
--
-- Approach: add a nullable user_id column (the Firebase UID string from
-- the ID token), backfill is intentionally skipped — pre-existing rows
-- get NULL and become invisible to every user from this point forward.
-- That's the safest behavior: those drafts were created in a non-scoped
-- context, so we can't safely re-attribute them to anyone.
--
-- Once user_id is populated for new rows, we add a partial index on
-- (user_id, status, updated_at DESC) so the per-user "my drafts" listing
-- stays fast as the table grows.

ALTER TABLE loi_drafts
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Existing partial indexes on status/updated_at remain useful, but every
-- query is now also filtered by user_id. Add a composite that matches
-- the actual access pattern.
CREATE INDEX IF NOT EXISTS idx_loi_drafts_user_status_updated
  ON loi_drafts(user_id, status, updated_at DESC)
  WHERE user_id IS NOT NULL;
