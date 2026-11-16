-- Additive Practice extension. Existing bookings/financial history are untouched.
CREATE TABLE booking_source_methods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 products text[] NOT NULL, award boolean NOT NULL DEFAULT false,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(name), CHECK(products <@ ARRAY['Flight','Hotel','Car','Other']::text[] AND cardinality(products)>0)
);
CREATE TABLE booking_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 travel_component_id uuid REFERENCES travel_components(id),
 reference_type text NOT NULL CHECK(reference_type IN ('airline_pnr','ticket_number','booking_source_confirmation','hotel_confirmation','car_confirmation','other_reference')),
 value text NOT NULL CHECK(length(value) BETWEEN 1 AND 200), command_id uuid NOT NULL REFERENCES commands(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,reference_type,value)
);
CREATE INDEX booking_reference_search ON booking_references(lower(value));
CREATE TABLE booking_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, entry jsonb NOT NULL,
 created_by text NOT NULL, command_id uuid NOT NULL REFERENCES commands(id), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO booking_source_methods(name,products,award,created_by) VALUES
 ('GDS',ARRAY['Flight'],false,'system:booking-entry-seed'),
 ('Amex Travel / Business Platinum',ARRAY['Flight','Hotel'],false,'system:booking-entry-seed'),
 ('Capital One Travel',ARRAY['Flight','Hotel','Car'],false,'system:booking-entry-seed'),
 ('Award Booking',ARRAY['Flight','Hotel'],true,'system:booking-entry-seed'),
 ('Direct Hotel',ARRAY['Hotel'],false,'system:booking-entry-seed'),
 ('Expedia TAAP',ARRAY['Hotel','Car'],false,'system:booking-entry-seed'),
 ('Other / Custom',ARRAY['Flight','Hotel','Car','Other'],false,'system:booking-entry-seed');
DO $$ DECLARE t text; api_role text; BEGIN
 FOREACH t IN ARRAY ARRAY['booking_source_methods','booking_references','booking_drafts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC',t);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,api_role);
   END IF;
  END LOOP;
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_change()',t);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('013_booking_entry');
