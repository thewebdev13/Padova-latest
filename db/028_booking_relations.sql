-- Plan v1: related bookings family tree (change/extension, voucher, same trip).
CREATE TABLE booking_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_booking_id uuid NOT NULL REFERENCES bookings(id),
  to_booking_id uuid NOT NULL REFERENCES bookings(id),
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
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES staff(id),
  CHECK (from_booking_id <> to_booking_id)
);
CREATE INDEX booking_relations_from_idx ON booking_relations(from_booking_id) WHERE voided_at IS NULL;
CREATE INDEX booking_relations_to_idx ON booking_relations(to_booking_id) WHERE voided_at IS NULL;
ALTER TABLE booking_relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_relations FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('028_booking_relations');
