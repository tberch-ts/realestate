-- Phase 3: extend deals table with asset class, levers, notes, and underwriting output.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS asset_class        TEXT,
  ADD COLUMN IF NOT EXISTS levers             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes              TEXT,
  ADD COLUMN IF NOT EXISTS underwriting_output JSONB;
