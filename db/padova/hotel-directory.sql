-- PREPARED ONLY. Additive hotel directory on installed US padova + Partnerships.
-- No financial posting, adapter reinstall, schema/project creation or gate changes.
-- Apply only after Owner review, fresh backup/restore verification, and Partnerships installed.
BEGIN;
SET LOCAL search_path=padova,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter') THEN RAISE EXCEPTION 'Existing adapter required; never reinstall it'; END IF;
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261104_partnership_sales_crm') THEN RAISE EXCEPTION 'Partnerships extension required before hotel directory'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261116_hotel_directory') THEN RAISE EXCEPTION 'Hotel directory already installed; do not reinstall'; END IF;
END $$;
CREATE TABLE pt_hotel_directory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 location text NOT NULL CHECK(length(trim(location))>0),
 hotel_name text NOT NULL CHECK(length(trim(hotel_name))>0),
 corporate_code text NOT NULL DEFAULT '',
 iata_code text NOT NULL DEFAULT '',
 hotel_commission text NOT NULL DEFAULT '',
 commission_rate_bps integer CHECK(commission_rate_bps IS NULL OR (commission_rate_bps>=0 AND commission_rate_bps<=10000)),
 best_book_method text NOT NULL DEFAULT '',
 discounts text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 organization_id uuid REFERENCES pt_organizations(id),
 party_id uuid REFERENCES padova.parties(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id uuid NOT NULL REFERENCES padova.staff(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pt_hotel_directory_location ON pt_hotel_directory(lower(location));
CREATE INDEX pt_hotel_directory_name ON pt_hotel_directory(lower(hotel_name));
CREATE UNIQUE INDEX pt_hotel_directory_active_unique
 ON pt_hotel_directory(lower(hotel_name), lower(location))
 WHERE status='active';
ALTER TABLE pt_hotel_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.pt_hotel_directory FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.pt_hotel_directory TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON padova.pt_hotel_directory TO padova_app_server;
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.pt_hotel_directory FOR EACH STATEMENT EXECUTE FUNCTION padova.pt_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.pt_hotel_directory TO padova_backup; END IF; END $$;
INSERT INTO padova.app_schema_versions(version) VALUES('20261116_hotel_directory');
COMMIT;
