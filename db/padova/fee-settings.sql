-- Additive Plan v1 fee defaults (QA/reviewed apply only; never reinstall adapter).
-- Customer card fee ~2.9%; Padova processor ~2.7% + $0.30 — both editable.
CREATE TABLE IF NOT EXISTS padova.fee_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  customer_card_fee_bps integer NOT NULL DEFAULT 290 CHECK (customer_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_bps integer NOT NULL DEFAULT 270 CHECK (padova_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_flat_cents bigint NOT NULL DEFAULT 30 CHECK (padova_card_fee_flat_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO padova.fee_settings (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE padova.fee_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_server ON padova.fee_settings;
CREATE POLICY app_server ON padova.fee_settings TO padova_app_server USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON padova.fee_settings TO padova_app_server;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_fee_settings')
  ON CONFLICT (version) DO NOTHING;
