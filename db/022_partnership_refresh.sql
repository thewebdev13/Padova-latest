-- Synthetic local fixture. Hosted extension is prepared separately.
CREATE TABLE pt_ai_refresh_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL UNIQUE,
 grant_id uuid NOT NULL REFERENCES pt_ai_grants(id),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pt_refresh_grant ON pt_ai_refresh_tokens(grant_id);
ALTER TABLE pt_ai_refresh_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pt_ai_refresh_tokens FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
 FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
 EXECUTE format('REVOKE ALL ON pt_ai_refresh_tokens FROM %I',api_role);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('022_partnership_refresh');
