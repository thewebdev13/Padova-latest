-- PREPARED ONLY. Existing adapter and booking-entry extensions required. No backfill, posting, source or gate changes.
-- Reusable booking portal identity, independent of payment and inventory ownership.
CREATE TABLE padova.booking_source_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_method_id uuid NOT NULL REFERENCES padova.booking_source_methods(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 500),
  provider text NOT NULL,
  holder_id uuid REFERENCES padova.parties(id),
  safe_identifier text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('Active','Inactive')),
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE padova.source_profile_assets (
  asset_id uuid PRIMARY KEY REFERENCES padova.assets(id),
  profile_id uuid NOT NULL REFERENCES padova.booking_source_profiles(id)
);
ALTER TABLE padova.booking_source_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova.source_profile_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.booking_source_profiles,padova.source_profile_assets FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.booking_source_profiles FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.source_profile_assets FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.booking_source_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.booking_source_profiles FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.booking_source_profiles TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.booking_source_profiles TO padova_app_server;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.booking_source_profiles TO padova_backup; END IF; END $$;

ALTER TABLE padova.source_profile_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.source_profile_assets FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.source_profile_assets TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.source_profile_assets TO padova_app_server;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.source_profile_assets TO padova_backup; END IF; END $$;

INSERT INTO padova.app_schema_versions(version) VALUES('20261030_v1_source_profiles');
