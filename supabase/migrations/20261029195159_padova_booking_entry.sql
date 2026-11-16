-- Prepared/tested in Practice and isolated adapter fixtures; NOT installed in the US project.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_fulfillment_catalogs_units') THEN RAISE EXCEPTION 'Installed catalog foundation required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_booking_entry') THEN RAISE EXCEPTION 'Already installed; never reinstall'; END IF;
END $$;
ALTER TABLE padova.commissions ALTER COLUMN app_due_on DROP NOT NULL;
ALTER TABLE padova.fulfillment_details ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE padova.fulfillment_details ADD CONSTRAINT owned_quantity_required CHECK(mode='Outside source' OR quantity IS NOT NULL);
-- Additive Practice extension. Existing bookings/financial history are untouched.
CREATE TABLE padova.booking_source_methods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 products text[] NOT NULL, award boolean NOT NULL DEFAULT false,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(name), CHECK(products <@ ARRAY['Flight','Hotel','Car','Other']::text[] AND cardinality(products)>0)
);
CREATE TABLE padova.booking_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES padova.bookings(id),
 travel_component_id uuid REFERENCES padova.travel_components(id),
 reference_type text NOT NULL CHECK(reference_type IN ('airline_pnr','ticket_number','booking_source_confirmation','hotel_confirmation','car_confirmation','other_reference')),
 value text NOT NULL CHECK(length(value) BETWEEN 1 AND 200), command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,reference_type,value)
);
CREATE INDEX booking_reference_search ON padova.booking_references(lower(value));
CREATE TABLE padova.booking_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, entry jsonb NOT NULL,
 created_by text NOT NULL, command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO padova.booking_source_methods(name,products,award,created_by) VALUES
 ('GDS',ARRAY['Flight'],false,'system:booking-entry-seed'),
 ('Amex Travel / Business Platinum',ARRAY['Flight','Hotel'],false,'system:booking-entry-seed'),
 ('Capital One Travel',ARRAY['Flight','Hotel','Car'],false,'system:booking-entry-seed'),
 ('Award Booking',ARRAY['Flight','Hotel'],true,'system:booking-entry-seed'),
 ('Direct Hotel',ARRAY['Hotel'],false,'system:booking-entry-seed'),
 ('Expedia TAAP',ARRAY['Hotel','Car'],false,'system:booking-entry-seed'),
 ('Other / Custom',ARRAY['Flight','Hotel','Car','Other'],false,'system:booking-entry-seed');

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['booking_source_methods','booking_references','booking_drafts'] LOOP
  EXECUTE format('ALTER TABLE padova.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE padova.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT ON TABLE padova.%I TO padova_app_server',t);
  EXECUTE format('CREATE POLICY app_server ON padova.%I TO padova_app_server USING(true) WITH CHECK(true)',t);
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.%I FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation()',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN
   EXECUTE format('GRANT SELECT ON TABLE padova.%I TO padova_backup',t);
  END IF;
 END LOOP;
END $$;
INSERT INTO padova.app_schema_versions(version) VALUES('20261029_booking_entry');
