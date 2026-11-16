CREATE TABLE personal_recovery_codes(code_hash text PRIMARY KEY,staff_id uuid NOT NULL REFERENCES staff(id),used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX personal_recovery_staff_idx ON personal_recovery_codes(staff_id) WHERE used_at IS NULL;
ALTER TABLE personal_recovery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON personal_recovery_codes FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON personal_recovery_codes FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON personal_recovery_codes FROM authenticated; END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('009_personal_recovery_codes');
