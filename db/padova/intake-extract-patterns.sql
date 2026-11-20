-- PREPARED ONLY. Additive intake pattern-learn on installed US/QA padova.
-- No financial posting, adapter reinstall, or gate changes.
-- Apply on QA first after Owner OK; production only after UNLOCK_PRODUCTION_INTAKE + YES_DEPLOY_PROD.
BEGIN;
SET LOCAL search_path=padova,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter') THEN RAISE EXCEPTION 'Existing adapter required; never reinstall it'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261120_intake_extract_patterns') THEN RAISE EXCEPTION 'Intake extract patterns already installed; do not reinstall'; END IF;
END $$;

CREATE TABLE intake_extract_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL CHECK(length(trim(fingerprint))>0 AND length(fingerprint)<=200),
  source_hint text NOT NULL DEFAULT '' CHECK(length(source_hint)<=80),
  field_labels text[] NOT NULL DEFAULT '{}',
  extract_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_paste text NOT NULL DEFAULT '' CHECK(length(sample_paste)<=20000),
  hit_count integer NOT NULL DEFAULT 0 CHECK(hit_count>=0),
  disabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

CREATE UNIQUE INDEX intake_extract_patterns_fingerprint
  ON intake_extract_patterns(fingerprint);
CREATE INDEX intake_extract_patterns_hits ON intake_extract_patterns(hit_count DESC, updated_at DESC);

ALTER TABLE intake_extract_patterns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.intake_extract_patterns FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.intake_extract_patterns TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON padova.intake_extract_patterns TO padova_app_server;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.intake_extract_patterns TO padova_backup; END IF; END $$;

INSERT INTO padova.app_schema_versions(version) VALUES('20261120_intake_extract_patterns');
COMMIT;
