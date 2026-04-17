-- LOI drafts: in-progress letters of intent keyed by address.
-- Allows starting an LOI before a full Deal is underwritten and saving progress.

CREATE TABLE IF NOT EXISTS loi_drafts (
  id            BIGSERIAL PRIMARY KEY,
  address       TEXT NOT NULL,
  deal_id       BIGINT REFERENCES deals(id) ON DELETE SET NULL,
  property_id   BIGINT REFERENCES properties(id) ON DELETE SET NULL,
  data          JSONB NOT NULL,                   -- { loi: LoiInput, dealContext: LoiDealContext }
  status        TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | archived
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loi_drafts_address ON loi_drafts(lower(address));
CREATE INDEX IF NOT EXISTS idx_loi_drafts_status ON loi_drafts(status);
CREATE INDEX IF NOT EXISTS idx_loi_drafts_updated_at ON loi_drafts(updated_at DESC);
