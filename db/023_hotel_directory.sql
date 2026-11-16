-- Synthetic local fixture. Hosted extension is prepared separately in db/padova/hotel-directory.sql.
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
 party_id uuid REFERENCES parties(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id uuid NOT NULL REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pt_hotel_directory_location ON pt_hotel_directory(lower(location));
CREATE INDEX pt_hotel_directory_name ON pt_hotel_directory(lower(hotel_name));
CREATE UNIQUE INDEX pt_hotel_directory_active_unique
 ON pt_hotel_directory(lower(hotel_name), lower(location))
 WHERE status='active';
ALTER TABLE pt_hotel_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pt_hotel_directory FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
 FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
 EXECUTE format('REVOKE ALL ON pt_hotel_directory FROM %I',api_role);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('023_hotel_directory');
