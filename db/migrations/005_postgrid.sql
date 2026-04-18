-- PostGrid outbound postal mail: track each letter sent + where it's at.
-- Also a small key/value app_settings table so the sender address (and future
-- app-level config) has a durable home without requiring a new env var per field.

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS letters (
  id                 BIGSERIAL PRIMARY KEY,
  contact_id         BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  interaction_id     BIGINT REFERENCES interactions(id) ON DELETE SET NULL,
  deal_id            BIGINT REFERENCES deals(id) ON DELETE SET NULL,
  draft_id           BIGINT REFERENCES loi_drafts(id) ON DELETE SET NULL,
  -- PostGrid identifiers
  provider           TEXT NOT NULL DEFAULT 'postgrid',
  provider_id        TEXT,                     -- letter_xxx
  live               BOOLEAN NOT NULL DEFAULT false,
  -- Letter contents + state
  subject            TEXT,
  html               TEXT,                     -- rendered HTML (what we sent)
  pdf_url            TEXT,                     -- if we sent a PDF instead
  status             TEXT NOT NULL,            -- ready, printing, in_transit, delivered, canceled, failed
  carrier_tracking   JSONB,                    -- PostGrid's structured tracking (USPS number, URL, events)
  send_date          TIMESTAMPTZ,
  expected_delivery  DATE,
  -- Sender + recipient snapshots so we keep history even if contact is edited later
  sender_snapshot    JSONB,
  recipient_snapshot JSONB,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_letters_contact  ON letters (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_letters_status   ON letters (status);
CREATE INDEX IF NOT EXISTS idx_letters_provider_id ON letters (provider, provider_id);
