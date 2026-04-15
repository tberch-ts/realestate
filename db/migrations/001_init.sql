-- Core tables for v1. Expanded in later phases.

CREATE TABLE IF NOT EXISTS properties (
  id            BIGSERIAL PRIMARY KEY,
  address       TEXT NOT NULL,
  normalized    TEXT NOT NULL UNIQUE,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_data (
  id            BIGSERIAL PRIMARY KEY,
  property_id   BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_property_data_provider ON property_data(provider);

-- Deals: a property the user is actively considering. v1 is minimal.
CREATE TABLE IF NOT EXISTS deals (
  id                BIGSERIAL PRIMARY KEY,
  property_id       BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name              TEXT,
  purchase_price    NUMERIC(14, 2),
  units             INTEGER,
  underwriting      JSONB,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
