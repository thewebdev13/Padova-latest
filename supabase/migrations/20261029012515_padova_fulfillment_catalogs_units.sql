-- Incremental unit/catalog extension; consult docs/FULFILLMENT_ARCHITECTURE.md for installation status.
-- Additive catalogs/component metadata; nullable units, no data backfill or staging access.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter') THEN RAISE EXCEPTION 'The existing installed adapter is required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_fulfillment_catalogs_units') THEN RAISE EXCEPTION 'Fulfillment extension is already installed; do not reinstall'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('app_write_assets','21be28ebdf6d59a7185d2224bc53c6d4'),('app_write_funding_components','0ea933d8062d588a668c7cd528e6ca1c'),('app_write_asset_movements','9b20d62e794f5a3e81e93a37c8626274'),('app_write_refund','d48509abb886a19982392c9183131d8d')) expected(name,hash)
 LEFT JOIN pg_proc p ON p.proname=expected.name AND p.pronamespace='padova'::regnamespace AND p.pronargs=0 WHERE p.oid IS NULL OR md5(p.prosrc)<>expected.hash) THEN RAISE EXCEPTION 'Installed adapter changed; inspect before extending it'; END IF;
END $$;
ALTER TABLE padova.assets ADD COLUMN app_unit text CHECK(app_unit IN ('money','points','count'));
ALTER TABLE padova.funding_components ADD COLUMN app_unit text CHECK(app_unit IN ('money','points','count'));
ALTER TABLE padova.supplier_refunds ADD COLUMN app_quantity_unit text CHECK(app_quantity_unit IN ('money','points','count'));
CREATE OR REPLACE VIEW padova.app_assets WITH (security_invoker=true) AS SELECT b."id" AS "id",b."app_name" AS "name",COALESCE(b.app_kind,b.kind) AS "kind",b."app_issuer" AS "issuer",b."holder_id" AS "holder_id",b."app_seller_id" AS "seller_id",b."origin_booking_id" AS "source_booking_id",b."app_ownership" AS "ownership",b."expires_on" AS "expires_on",b."restrictions" AS "restrictions",b."reference" AS "reference",b."created_at" AS "created_at",CASE WHEN COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END)<>'money' THEN padova.app_whole(b.original_face) ELSE padova.app_cents(b.original_face) END AS "opening_quantity",padova.app_cents(b.original_basis) AS "opening_cost",COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END) AS unit FROM padova."assets" b;
CREATE OR REPLACE FUNCTION padova.app_write_assets() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO padova."assets" ("id","app_name","kind","app_issuer","holder_id","app_seller_id","origin_booking_id","app_ownership","expires_on","restrictions","reference","created_at","original_face","original_basis","app_kind","app_unit","verification") VALUES (NEW."id",NEW."name",CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)='points' THEN 'points' WHEN NEW.kind='Capital One Credit' THEN 'capital_one_credit' ELSE 'voucher' END,NEW."issuer",NEW."holder_id",NEW."seller_id",NEW."source_booking_id",NEW."ownership",NEW."expires_on",NEW."restrictions",NEW."reference",NEW."created_at",CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)<>'money' THEN NEW.opening_quantity ELSE NEW.opening_quantity::numeric/100 END,NEW.opening_cost::numeric/100,NEW.kind,COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END),'owner_confirmed');
 ELSIF TG_OP='UPDATE' THEN
 UPDATE padova."assets" SET "app_name"=NEW."name","kind"=CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)='points' THEN 'points' WHEN NEW.kind='Capital One Credit' THEN 'capital_one_credit' ELSE 'voucher' END,"app_issuer"=NEW."issuer","holder_id"=NEW."holder_id","app_seller_id"=NEW."seller_id","origin_booking_id"=NEW."source_booking_id","app_ownership"=NEW."ownership","expires_on"=NEW."expires_on","restrictions"=NEW."restrictions","reference"=NEW."reference","created_at"=NEW."created_at","original_face"=CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)<>'money' THEN NEW.opening_quantity ELSE NEW.opening_quantity::numeric/100 END,"original_basis"=NEW.opening_cost::numeric/100,"app_unit"=COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END),"app_kind"=NEW.kind,"verification"='owner_confirmed' WHERE "id"=OLD."id";
 ELSE RAISE EXCEPTION 'Adapter deletion is not permitted'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE VIEW padova.app_funding_components WITH (security_invoker=true) AS SELECT b."id" AS "id",b."booking_id" AS "booking_id",COALESCE(b.app_kind,b.kind) AS "kind",CASE WHEN COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END)<>'money' THEN padova.app_whole(b.face_amount) ELSE padova.app_cents(b.face_amount) END AS "face_amount",padova.app_cents(b."cost_basis") AS "cost",b."app_asset_id" AS "asset_id",b."asset_movement_id" AS "asset_movement_id",b."app_account_id" AS "account_id",b."app_seller_id" AS "seller_id",b."reference" AS "reference",b."app_effective_on" AS "effective_on",b."app_command_id" AS "command_id",COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END) AS unit FROM padova."funding_components" b;
CREATE OR REPLACE FUNCTION padova.app_write_funding_components() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO padova."funding_components" ("id","booking_id","kind","face_amount","cost_basis","app_asset_id","asset_movement_id","app_account_id","app_seller_id","reference","app_effective_on","app_command_id","app_kind","app_unit") VALUES (NEW."id",NEW."booking_id",CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)='points' THEN 'points' WHEN NEW.kind ~* 'voucher|credit' THEN 'voucher' WHEN NEW.kind ~* 'card' THEN 'card' ELSE 'cash' END,CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)<>'money' THEN NEW.face_amount ELSE NEW.face_amount::numeric/100 END,NEW."cost"::numeric/100,NEW."asset_id",NEW."asset_movement_id",NEW."account_id",NEW."seller_id",NEW."reference",NEW."effective_on",NEW."command_id",NEW.kind,COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END));
 ELSIF TG_OP='UPDATE' THEN
 UPDATE padova."funding_components" SET "booking_id"=NEW."booking_id","kind"=CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)='points' THEN 'points' WHEN NEW.kind ~* 'voucher|credit' THEN 'voucher' WHEN NEW.kind ~* 'card' THEN 'card' ELSE 'cash' END,"face_amount"=CASE WHEN COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)<>'money' THEN NEW.face_amount ELSE NEW.face_amount::numeric/100 END,"cost_basis"=NEW."cost"::numeric/100,"app_asset_id"=NEW."asset_id","asset_movement_id"=NEW."asset_movement_id","app_account_id"=NEW."account_id","app_seller_id"=NEW."seller_id","reference"=NEW."reference","app_effective_on"=NEW."effective_on","app_command_id"=NEW."command_id","app_unit"=COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END),"app_kind"=NEW.kind WHERE "id"=OLD."id";
 ELSE RAISE EXCEPTION 'Adapter deletion is not permitted'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION padova.app_write_asset_movements() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO padova."asset_movements" ("id","asset_id","app_lot_id","booking_id","app_quantity","basis_delta","kind","effective_date","app_original_movement_id","app_command_id","app_kind","face_delta") VALUES (NEW."id",NEW."asset_id",NEW."lot_id",NEW."booking_id",NEW.quantity,NEW."basis"::numeric/100,CASE WHEN NEW.kind='sale' THEN 'sale' WHEN NEW.kind='expiration' THEN 'expiry' WHEN NEW.kind IN ('acquisition','earned_credit','voucherization','supplier_refund') THEN 'create' WHEN NEW.quantity>0 THEN 'return' ELSE 'use' END,NEW."effective_on",NEW."original_movement_id",NEW."command_id",NEW.kind,CASE WHEN (SELECT COALESCE(app_unit,CASE WHEN kind='points' THEN 'points' ELSE 'money' END) FROM padova.assets WHERE id=NEW.asset_id)<>'money' THEN NEW.quantity ELSE NEW.quantity::numeric/100 END);
 ELSIF TG_OP='UPDATE' THEN
 UPDATE padova."asset_movements" SET "asset_id"=NEW."asset_id","app_lot_id"=NEW."lot_id","booking_id"=NEW."booking_id","app_quantity"=NEW.quantity,"basis_delta"=NEW."basis"::numeric/100,"kind"=CASE WHEN NEW.kind='sale' THEN 'sale' WHEN NEW.kind='expiration' THEN 'expiry' WHEN NEW.kind IN ('acquisition','earned_credit','voucherization','supplier_refund') THEN 'create' WHEN NEW.quantity>0 THEN 'return' ELSE 'use' END,"effective_date"=NEW."effective_on","app_original_movement_id"=NEW."original_movement_id","app_command_id"=NEW."command_id","app_kind"=NEW.kind,"face_delta"=CASE WHEN (SELECT COALESCE(app_unit,CASE WHEN kind='points' THEN 'points' ELSE 'money' END) FROM padova.assets WHERE id=NEW.asset_id)<>'money' THEN NEW.quantity ELSE NEW.quantity::numeric/100 END WHERE "id"=OLD."id";
 ELSE RAISE EXCEPTION 'Adapter deletion is not permitted'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE VIEW padova.app_asset_balances WITH(security_invoker=true) AS
 SELECT a.id,a.name,a.kind,a.issuer,a.holder_id,a.seller_id,a.source_booking_id,a.ownership,a.expires_on,a.restrictions,a.reference,a.created_at,a.opening_quantity,a.opening_cost,
 COALESCE((SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 COALESCE((SELECT sum(basis) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS remaining_basis,a.unit FROM padova.app_assets a;
CREATE OR REPLACE VIEW padova.app_refunds WITH(security_invoker=true) AS
 SELECT s.id,s.booking_id,s.app_traveler_id AS traveler_id,s.funding_id AS funding_component_id,
 CASE WHEN s.app_unit='points' THEN padova.app_whole(s.expected) ELSE padova.app_cents(s.expected) END AS supplier_expected,
 padova.app_cents(s.app_expected_basis) AS expected_basis,COALESCE(s.app_unit,'cents') AS unit,
 padova.app_cents(c.due) AS customer_due,s.app_due_on AS due_on,s.app_reason AS reason,s.app_command_id AS command_id,s.app_quantity_unit AS quantity_unit
 FROM padova.supplier_refunds s LEFT JOIN padova.customer_refunds c ON c.id=s.app_customer_refund_id;
CREATE OR REPLACE FUNCTION padova.app_write_refund() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE cid uuid:=gen_random_uuid(); BEGIN
 INSERT INTO padova.customer_refunds(id,booking_id,payee_id,due,paid,retained_fee) SELECT cid,NEW.booking_id,b.customer_id,NEW.customer_due::numeric/100,0,0 FROM padova.bookings b WHERE b.id=NEW.booking_id;
 INSERT INTO padova.supplier_refunds(id,booking_id,funding_id,expected,received,returned_kind,requires_review,app_customer_refund_id,app_traveler_id,app_unit,app_expected_basis,app_due_on,app_reason,app_command_id,app_quantity_unit)
 VALUES(NEW.id,NEW.booking_id,NEW.funding_component_id,CASE WHEN NEW.unit='points' THEN NEW.supplier_expected ELSE NEW.supplier_expected::numeric/100 END,0,'pending',true,cid,NEW.traveler_id,NEW.unit,NEW.expected_basis::numeric/100,NEW.due_on,NEW.reason,NEW.command_id,NEW.quantity_unit); RETURN NEW;
END $$;
CREATE TABLE padova.programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 category text NOT NULL CHECK(category IN ('Airline','Hotel','Bank','Portal','Other')),
 provider_id uuid REFERENCES padova.parties(id),active boolean NOT NULL DEFAULT true,
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX program_name_unique ON padova.programs(lower(trim(name)));
CREATE INDEX program_provider_idx ON padova.programs(provider_id);
CREATE TABLE padova.instruments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES padova.programs(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 unit text NOT NULL CHECK(unit IN ('money','points','count')),
 role text NOT NULL CHECK(role IN ('Core','Ancillary','Both')),
 rules jsonb NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instrument_name_unique ON padova.instruments(program_id,lower(trim(name)));
CREATE TABLE padova.program_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES padova.programs(id),
 holder_id uuid NOT NULL REFERENCES padova.parties(id),name text NOT NULL,
 masked_reference text NOT NULL DEFAULT '' CHECK(length(masked_reference)<=4),
 ownership text NOT NULL CHECK(ownership IN ('Padova','External','Customer')),
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,holder_id,name)
);
CREATE INDEX program_account_holder_idx ON padova.program_accounts(holder_id);
CREATE TABLE padova.travel_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES padova.bookings(id),
 product text NOT NULL,summary text NOT NULL,provider_id uuid REFERENCES padova.parties(id),
 channel text,acquisition_source_id uuid REFERENCES padova.parties(id),
 travel_start date NOT NULL,travel_end date NOT NULL CHECK(travel_end>=travel_start),
 details jsonb NOT NULL DEFAULT '{}',command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,booking_id)
);
CREATE INDEX travel_component_booking_idx ON padova.travel_components(booking_id);
CREATE INDEX travel_component_provider_idx ON padova.travel_components(provider_id);
CREATE INDEX travel_component_source_idx ON padova.travel_components(acquisition_source_id);
CREATE TABLE padova.inventory_profiles (
 asset_id uuid PRIMARY KEY REFERENCES padova.assets(id),instrument_id uuid NOT NULL REFERENCES padova.instruments(id),
 program_account_id uuid REFERENCES padova.program_accounts(id),
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_instrument_idx ON padova.inventory_profiles(instrument_id);
CREATE INDEX inventory_account_idx ON padova.inventory_profiles(program_account_id);
CREATE TABLE padova.fulfillment_details (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES padova.bookings(id),
 travel_component_id uuid NOT NULL,instrument_id uuid REFERENCES padova.instruments(id),
 program_account_id uuid REFERENCES padova.program_accounts(id),source_id uuid REFERENCES padova.parties(id),
 mode text NOT NULL CHECK(mode IN ('Cash/Card','Outside source','Owned inventory')),
 role text NOT NULL CHECK(role IN ('Core','Ancillary')),
 unit text NOT NULL CHECK(unit IN ('money','points','count')),quantity bigint NOT NULL CHECK(quantity>0 AND quantity<=9000000000000),
 funding_component_id uuid NOT NULL UNIQUE REFERENCES padova.funding_components(id),
 terms jsonb NOT NULL DEFAULT '{}',command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(travel_component_id,booking_id) REFERENCES padova.travel_components(id,booking_id)
);
CREATE INDEX fulfillment_booking_idx ON padova.fulfillment_details(booking_id);
CREATE INDEX fulfillment_travel_idx ON padova.fulfillment_details(travel_component_id,booking_id);
CREATE INDEX fulfillment_instrument_idx ON padova.fulfillment_details(instrument_id);
CREATE INDEX fulfillment_account_idx ON padova.fulfillment_details(program_account_id);
CREATE INDEX fulfillment_source_idx ON padova.fulfillment_details(source_id);
CREATE TABLE padova.funding_asset_uses (
 funding_component_id uuid NOT NULL REFERENCES padova.funding_components(id),movement_id uuid NOT NULL UNIQUE REFERENCES padova.asset_movements(id),
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,PRIMARY KEY(funding_component_id,movement_id)
);
CREATE TABLE padova.expected_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES padova.bookings(id),
 kind text NOT NULL CHECK(kind IN ('Points rebate','Points transfer','Credit','Redeposit')),
 source_asset_id uuid REFERENCES padova.assets(id),target_asset_id uuid REFERENCES padova.assets(id),
 funding_component_id uuid REFERENCES padova.funding_components(id),
 quantity_sent bigint CHECK(quantity_sent>0),quantity_expected bigint NOT NULL CHECK(quantity_expected>0),
 due_on date,terms jsonb NOT NULL DEFAULT '{}',reference text NOT NULL DEFAULT '',
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expected_booking_idx ON padova.expected_events(booking_id);
CREATE INDEX expected_source_idx ON padova.expected_events(source_asset_id);
CREATE INDEX expected_target_idx ON padova.expected_events(target_asset_id);
CREATE INDEX expected_funding_idx ON padova.expected_events(funding_component_id);
CREATE TABLE padova.expected_event_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES padova.expected_events(id),
 status text NOT NULL CHECK(status IN ('Requested','Pending','Posted','Reversed','Denied')),
 effective_on date NOT NULL,reason text NOT NULL,posting_command_id uuid REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,
 command_id uuid NOT NULL REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('Posted','Reversed'))=(posting_command_id IS NOT NULL))
);
CREATE INDEX expected_update_event_idx ON padova.expected_event_updates(event_id,created_at);
CREATE UNIQUE INDEX expected_posting_unique ON padova.expected_event_updates(posting_command_id) WHERE posting_command_id IS NOT NULL;

ALTER TABLE padova.programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.programs FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.programs TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.programs TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.programs FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.instruments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.instruments FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.instruments TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.instruments TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.instruments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.program_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.program_accounts FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.program_accounts TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.program_accounts TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.program_accounts FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.travel_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.travel_components FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.travel_components TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.travel_components TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.travel_components FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.inventory_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.inventory_profiles FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.inventory_profiles TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.inventory_profiles TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.inventory_profiles FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.fulfillment_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.fulfillment_details FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.fulfillment_details TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.fulfillment_details TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.fulfillment_details FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.funding_asset_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.funding_asset_uses FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.funding_asset_uses TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.funding_asset_uses TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.funding_asset_uses FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.expected_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.expected_events FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.expected_events TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.expected_events TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.expected_events FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

ALTER TABLE padova.expected_event_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.expected_event_updates FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.expected_event_updates TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.expected_event_updates TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.expected_event_updates FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();

DO $$ DECLARE relation_name text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN
  FOREACH relation_name IN ARRAY ARRAY['programs','instruments','program_accounts','travel_components','inventory_profiles','fulfillment_details','funding_asset_uses','expected_events','expected_event_updates'] LOOP
   EXECUTE format('GRANT SELECT ON padova.%I TO padova_backup',relation_name);
  END LOOP;
 END IF;
END $$;

INSERT INTO padova.app_schema_versions(version) VALUES('20261029_fulfillment_catalogs_units');
