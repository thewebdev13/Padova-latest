-- Plan v1 Phase 4: editable card-fee defaults (customer pass-through + Padova processor cost).
CREATE TABLE fee_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  customer_card_fee_bps integer NOT NULL DEFAULT 290 CHECK (customer_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_bps integer NOT NULL DEFAULT 270 CHECK (padova_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_flat_cents bigint NOT NULL DEFAULT 30 CHECK (padova_card_fee_flat_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff(id)
);
INSERT INTO fee_settings (id) VALUES (true);
ALTER TABLE fee_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fee_settings FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('025_fee_settings');
