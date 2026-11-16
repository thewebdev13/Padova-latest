-- Local comparison fixture only. Cloud uses the separately reviewed incremental migration.
ALTER TABLE assets ADD COLUMN unit text CHECK(unit IN ('money','points','count'));
ALTER TABLE funding_components ADD COLUMN unit text CHECK(unit IN ('money','points','count'));
-- Retain the installed legacy whole-unit discriminator; explicit label distinguishes certificates.
ALTER TABLE refunds ADD COLUMN quantity_unit text CHECK(quantity_unit IN ('money','points','count'));
CREATE OR REPLACE VIEW asset_balances AS SELECT a.id,a.name,a.kind,a.issuer,a.holder_id,a.seller_id,a.source_booking_id,a.ownership,a.expires_on,a.restrictions,a.reference,a.created_at,
 COALESCE((SELECT sum(quantity) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 COALESCE((SELECT sum(basis) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint AS remaining_basis,a.unit FROM assets a;

CREATE TABLE programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 category text NOT NULL CHECK(category IN ('Airline','Hotel','Bank','Portal','Other')),
 provider_id uuid REFERENCES parties(id),active boolean NOT NULL DEFAULT true,
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX program_name_unique ON programs(lower(trim(name)));
CREATE INDEX program_provider_idx ON programs(provider_id);
CREATE TABLE instruments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES programs(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 unit text NOT NULL CHECK(unit IN ('money','points','count')),
 role text NOT NULL CHECK(role IN ('Core','Ancillary','Both')),
 rules jsonb NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instrument_name_unique ON instruments(program_id,lower(trim(name)));
CREATE TABLE program_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES programs(id),
 holder_id uuid NOT NULL REFERENCES parties(id),name text NOT NULL,
 masked_reference text NOT NULL DEFAULT '' CHECK(length(masked_reference)<=4),
 ownership text NOT NULL CHECK(ownership IN ('Padova','External','Customer')),
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,holder_id,name)
);
CREATE INDEX program_account_holder_idx ON program_accounts(holder_id);
CREATE TABLE travel_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES bookings(id),
 product text NOT NULL,summary text NOT NULL,provider_id uuid REFERENCES parties(id),
 channel text,acquisition_source_id uuid REFERENCES parties(id),
 travel_start date NOT NULL,travel_end date NOT NULL CHECK(travel_end>=travel_start),
 details jsonb NOT NULL DEFAULT '{}',command_id uuid NOT NULL REFERENCES commands(id),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,booking_id)
);
CREATE INDEX travel_component_booking_idx ON travel_components(booking_id);
CREATE INDEX travel_component_provider_idx ON travel_components(provider_id);
CREATE INDEX travel_component_source_idx ON travel_components(acquisition_source_id);
CREATE TABLE inventory_profiles (
 asset_id uuid PRIMARY KEY REFERENCES assets(id),instrument_id uuid NOT NULL REFERENCES instruments(id),
 program_account_id uuid REFERENCES program_accounts(id),
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_instrument_idx ON inventory_profiles(instrument_id);
CREATE INDEX inventory_account_idx ON inventory_profiles(program_account_id);
CREATE TABLE fulfillment_details (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES bookings(id),
 travel_component_id uuid NOT NULL,instrument_id uuid REFERENCES instruments(id),
 program_account_id uuid REFERENCES program_accounts(id),source_id uuid REFERENCES parties(id),
 mode text NOT NULL CHECK(mode IN ('Cash/Card','Outside source','Owned inventory')),
 role text NOT NULL CHECK(role IN ('Core','Ancillary')),
 unit text NOT NULL CHECK(unit IN ('money','points','count')),quantity bigint NOT NULL CHECK(quantity>0 AND quantity<=9000000000000),
 funding_component_id uuid NOT NULL UNIQUE REFERENCES funding_components(id),
 terms jsonb NOT NULL DEFAULT '{}',command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(travel_component_id,booking_id) REFERENCES travel_components(id,booking_id)
);
CREATE INDEX fulfillment_booking_idx ON fulfillment_details(booking_id);
CREATE INDEX fulfillment_travel_idx ON fulfillment_details(travel_component_id,booking_id);
CREATE INDEX fulfillment_instrument_idx ON fulfillment_details(instrument_id);
CREATE INDEX fulfillment_account_idx ON fulfillment_details(program_account_id);
CREATE INDEX fulfillment_source_idx ON fulfillment_details(source_id);
CREATE TABLE funding_asset_uses (
 funding_component_id uuid NOT NULL REFERENCES funding_components(id),movement_id uuid NOT NULL UNIQUE REFERENCES asset_movements(id),
 command_id uuid NOT NULL REFERENCES commands(id),PRIMARY KEY(funding_component_id,movement_id)
);
CREATE TABLE expected_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES bookings(id),
 kind text NOT NULL CHECK(kind IN ('Points rebate','Points transfer','Credit','Redeposit')),
 source_asset_id uuid REFERENCES assets(id),target_asset_id uuid REFERENCES assets(id),
 funding_component_id uuid REFERENCES funding_components(id),
 quantity_sent bigint CHECK(quantity_sent>0),quantity_expected bigint NOT NULL CHECK(quantity_expected>0),
 due_on date,terms jsonb NOT NULL DEFAULT '{}',reference text NOT NULL DEFAULT '',
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expected_booking_idx ON expected_events(booking_id);
CREATE INDEX expected_source_idx ON expected_events(source_asset_id);
CREATE INDEX expected_target_idx ON expected_events(target_asset_id);
CREATE INDEX expected_funding_idx ON expected_events(funding_component_id);
CREATE TABLE expected_event_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES expected_events(id),
 status text NOT NULL CHECK(status IN ('Requested','Pending','Posted','Reversed','Denied')),
 effective_on date NOT NULL,reason text NOT NULL,posting_command_id uuid REFERENCES commands(id),
 command_id uuid NOT NULL REFERENCES commands(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('Posted','Reversed'))=(posting_command_id IS NOT NULL))
);
CREATE INDEX expected_update_event_idx ON expected_event_updates(event_id,created_at);
CREATE UNIQUE INDEX expected_posting_unique ON expected_event_updates(posting_command_id) WHERE posting_command_id IS NOT NULL;
DO $$ DECLARE t text; api_role text; BEGIN
 FOREACH t IN ARRAY ARRAY['programs','instruments','program_accounts','travel_components','inventory_profiles','fulfillment_details','funding_asset_uses','expected_events','expected_event_updates'] LOOP
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
INSERT INTO schema_migrations(version) VALUES('011_fulfillment_catalogs');
