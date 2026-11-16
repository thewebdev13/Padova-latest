-- Owner-authorized historical preparation only. Never posts operational finance.
DO $$ BEGIN
 PERFORM pg_advisory_xact_lock(71280428);
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_owned_reward_reversal_positions') THEN RAISE EXCEPTION 'Installed current Padova foundation required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_historical_booking_preparations') THEN RAISE EXCEPTION 'Historical preparation extension already installed; never reinstall'; END IF;
END $$;
CREATE TABLE padova.historical_booking_preparations (
 id uuid PRIMARY KEY,
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 financial_postings_authorized boolean NOT NULL DEFAULT false CHECK(NOT financial_postings_authorized),
 prepared_by text NOT NULL DEFAULT current_user,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE padova.historical_source_preparations (
 id uuid PRIMARY KEY,
 source_key text NOT NULL UNIQUE,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN ('Prepared booking','Linked supporting row','Needs Review','Preserved supporting row')),
 target_id uuid REFERENCES padova.historical_booking_preparations(id),
 evidence_record_id uuid REFERENCES padova_staging.evidence_records(id),
 summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object'),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 source_payload_gzip bytea NOT NULL CHECK(octet_length(source_payload_gzip)>0),
 source_payload_sha256 text NOT NULL CHECK(source_payload_sha256 ~ '^[a-f0-9]{64}$'),
 rationale text NOT NULL,
 financial_review boolean NOT NULL,
 prepared_by text NOT NULL DEFAULT current_user,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('Prepared booking','Linked supporting row') OR target_id IS NOT NULL)
);
CREATE INDEX historical_source_target_idx ON padova.historical_source_preparations(target_id);
CREATE INDEX historical_source_status_idx ON padova.historical_source_preparations(status);
CREATE INDEX historical_source_evidence_idx ON padova.historical_source_preparations(evidence_record_id);
ALTER TABLE padova.historical_booking_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE padova.historical_source_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.historical_booking_preparations,padova.historical_source_preparations FROM PUBLIC,anon,authenticated,service_role,padova_app_server;
GRANT SELECT ON padova.historical_booking_preparations,padova.historical_source_preparations TO padova_app_server,padova_backup;
CREATE POLICY historical_booking_server_read ON padova.historical_booking_preparations FOR SELECT TO padova_app_server USING(true);
CREATE POLICY historical_source_server_read ON padova.historical_source_preparations FOR SELECT TO padova_app_server USING(true);
CREATE TRIGGER historical_booking_immutable BEFORE UPDATE OR DELETE ON padova.historical_booking_preparations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER historical_source_immutable BEFORE UPDATE OR DELETE ON padova.historical_source_preparations FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
COMMENT ON TABLE padova.historical_booking_preparations IS 'Prepared historical operational facts, never live bookings or financial postings. Owner-only application reads after fresh individual authorization.';
COMMENT ON TABLE padova.historical_source_preparations IS 'Complete captured source rows, compressed losslessly, with fingerprint, provenance, staged financial claims and conservative review status. Original evidence remains unchanged.';
INSERT INTO padova.app_schema_versions(version) VALUES('20261029_historical_booking_preparations');
