-- CRM: contacts, interactions, follow-ups.
-- Contacts can be sourced manually, pulled from Denver portfolio owners, or harvested
-- from SEC Form D filings. Interactions are dated notes. Follow-ups are tasks with a
-- due date and a status. Properties and filings link through join tables so we can
-- answer "who's the contact for this property" and "which sponsor filed this offering".

CREATE TABLE IF NOT EXISTS contacts (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('person','firm')),
  name            TEXT NOT NULL,              -- person full name OR firm name
  firm_name       TEXT,                       -- if kind=person and they work for a firm
  email           TEXT,
  phone           TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state_code      TEXT,
  zip             TEXT,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual','form_d','portfolio','owner','loi')),
  source_ref      TEXT,                       -- accession number, owner key, etc.
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_name          ON contacts (lower(name));
CREATE INDEX IF NOT EXISTS idx_contacts_source        ON contacts (source, source_ref);
CREATE INDEX IF NOT EXISTS idx_contacts_state_status  ON contacts (state_code, status);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at    ON contacts (updated_at DESC);

CREATE TABLE IF NOT EXISTS interactions (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind            TEXT NOT NULL CHECK (kind IN ('call','email','meeting','note','outreach_sent','reply_received')),
  subject         TEXT,
  body            TEXT,                        -- free-text notes, markdown OK
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_contact_date ON interactions (contact_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS follow_ups (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  due_date        DATE NOT NULL,
  subject         TEXT NOT NULL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','done','skipped','snoozed')),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due  ON follow_ups (status, due_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_contact     ON follow_ups (contact_id);

-- Link contact -> property (typically a Denver parcel we've analyzed).
-- property_ref is a free-form identifier for now (parcel id or address hash);
-- normalizing to properties.id can happen once property rows are consistently written.
CREATE TABLE IF NOT EXISTS contact_properties (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  property_ref    TEXT NOT NULL,              -- parcel id or normalized address
  relation        TEXT NOT NULL
                    CHECK (relation IN ('owner','prospect','broker','seller','buyer','other')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, property_ref, relation)
);

CREATE INDEX IF NOT EXISTS idx_contact_properties_prop ON contact_properties (property_ref);

-- Link contact -> EDGAR Form D filing (for sponsors/promoters pulled from SEC filings).
CREATE TABLE IF NOT EXISTS contact_filings (
  id                  BIGSERIAL PRIMARY KEY,
  contact_id          BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  accession_number    TEXT NOT NULL,
  cik                 TEXT,
  relation            TEXT NOT NULL
                        CHECK (relation IN ('issuer','promoter','officer','director','other')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, accession_number, relation)
);

CREATE INDEX IF NOT EXISTS idx_contact_filings_acc ON contact_filings (accession_number);
