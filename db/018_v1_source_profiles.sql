-- Reusable booking portal identity, independent of payment and inventory ownership.
CREATE TABLE booking_source_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_method_id uuid NOT NULL REFERENCES booking_source_methods(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 500),
  provider text NOT NULL,
  holder_id uuid REFERENCES parties(id),
  safe_identifier text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('Active','Inactive')),
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_profile_assets (
  asset_id uuid PRIMARY KEY REFERENCES assets(id),
  profile_id uuid NOT NULL REFERENCES booking_source_profiles(id)
);
ALTER TABLE booking_source_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_profile_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_source_profiles,source_profile_assets FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON booking_source_profiles FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON source_profile_assets FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON booking_source_profiles,source_profile_assets FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON booking_source_profiles,source_profile_assets FROM authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE ALL ON booking_source_profiles,source_profile_assets FROM service_role;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_api') THEN
    GRANT SELECT,INSERT ON booking_source_profiles TO padova_api;
    GRANT SELECT,INSERT ON source_profile_assets TO padova_api;
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('018_v1_source_profiles');
