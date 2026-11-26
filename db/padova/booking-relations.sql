-- Additive Plan v1 related bookings (QA/reviewed apply only; never reinstall adapter).
CREATE TABLE IF NOT EXISTS padova.booking_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_booking_id uuid NOT NULL,
  to_booking_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN (
      'Change / extension',
      'Rebooking after cancel',
      'Voucher issued from',
      'Voucher used on',
      'Same trip',
      'Other'
    )),
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  CHECK (from_booking_id <> to_booking_id)
);
CREATE INDEX IF NOT EXISTS booking_relations_from_idx
  ON padova.booking_relations(from_booking_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_relations_to_idx
  ON padova.booking_relations(to_booking_id) WHERE voided_at IS NULL;
ALTER TABLE padova.booking_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_server ON padova.booking_relations;
CREATE POLICY app_server ON padova.booking_relations TO padova_app_server USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON padova.booking_relations TO padova_app_server;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_booking_relations')
  ON CONFLICT (version) DO NOTHING;
