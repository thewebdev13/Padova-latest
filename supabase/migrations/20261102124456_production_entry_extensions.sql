-- Production-only additive extension for accepted build bcfbf2adb23a6e07342bc8eb2c0a16dfa0de0ad8.
-- Target: existing US project unugynfzmxjxifgofxjr; apply only after independent recovery verification.
-- Separate Owner-authorized production artifact; the earlier QA migration remains unchanged.
-- No historical posting, financial-row replacement, gate activation, adapter reinstall or QA data.
DO $production_preflight$
DECLARE required text;
BEGIN
 IF to_regclass('padova.qa_environment') IS NOT NULL THEN RAISE EXCEPTION 'Production migration refuses QA'; END IF;
 FOREACH required IN ARRAY ARRAY['20261028_existing_padova_adapter','20261029_booking_entry','20261029_fulfillment_catalogs_units','20261029_historical_booking_preparations','20261029_owned_reward_reversal_positions','20261030_final_entry_integrity','20261030_v1_source_profiles','20261101_commission_payables'] LOOP
  IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version=required) THEN RAISE EXCEPTION 'Missing accepted prerequisite: %',required; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261102_targeted_entry_reliability') OR to_regclass('padova.supplier_allocation_reversals') IS NOT NULL THEN RAISE EXCEPTION 'Extension already present; do not reinstall'; END IF;
 IF NOT EXISTS(SELECT 1 FROM padova.settings WHERE id=true AND operational_entry_enabled=false AND historical_financial_posting_authorized=false AND historical_approved_batch_id IS NULL) THEN RAISE EXCEPTION 'Both production gates must remain locked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='padova.supplier_allocations'::regclass AND tgname='immutable_rows' AND tgenabled='O') THEN RAISE EXCEPTION 'Native immutable-history protection missing'; END IF;
END $production_preflight$;
ALTER TABLE padova.asset_lots ALTER COLUMN cost DROP NOT NULL;
ALTER TABLE padova.asset_movements ALTER COLUMN basis_delta DROP NOT NULL;
ALTER TABLE padova.assets ALTER COLUMN original_basis DROP NOT NULL;
ALTER TABLE padova.funding_components ALTER COLUMN cost_basis DROP NOT NULL;
ALTER TABLE padova.refund_movement_links ALTER COLUMN recognized_basis DROP NOT NULL;
CREATE OR REPLACE VIEW padova.app_asset_balances WITH(security_invoker=true) AS
 SELECT a.id,a.name,a.kind,a.issuer,a.holder_id,a.seller_id,a.source_booking_id,a.ownership,a.expires_on,a.restrictions,a.reference,a.created_at,a.opening_quantity,a.opening_cost,
 COALESCE((SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 CASE WHEN EXISTS(SELECT 1 FROM padova.app_asset_lots l WHERE l.asset_id=a.id AND l.cost IS NULL AND (SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.lot_id=l.id)>0) THEN NULL ELSE COALESCE((SELECT sum(basis) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint END AS remaining_basis,a.unit FROM padova.app_assets a;
-- Add outgoing allocation corrections without weakening receipt-only foreign keys.
CREATE TABLE padova.supplier_allocation_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL REFERENCES padova.supplier_allocations(id),
 amount bigint NOT NULL CHECK(amount>0),
 command_id uuid NOT NULL REFERENCES padova.command_context(id)
);
CREATE INDEX supplier_allocation_reversals_original ON padova.supplier_allocation_reversals(allocation_id);
-- Row-lock privilege only; immutable-history triggers still reject actual updates.
GRANT UPDATE(id) ON padova.supplier_allocations TO padova_app_server;
ALTER TABLE padova.supplier_allocation_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.supplier_allocation_reversals FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.supplier_allocation_reversals TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.supplier_allocation_reversals TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.supplier_allocation_reversals FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.supplier_allocation_reversals FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.supplier_allocation_reversals TO padova_backup; END IF; END $$;
CREATE OR REPLACE VIEW padova.app_payment_allocation_reversals WITH(security_invoker=true) AS
 SELECT id,reverses_id AS allocation_id,-padova.app_cents(amount) AS amount,app_command_id AS command_id FROM padova.receipt_allocations WHERE reverses_id IS NOT NULL
 UNION ALL SELECT id,allocation_id,amount,command_id FROM padova.supplier_allocation_reversals;
CREATE OR REPLACE FUNCTION padova.app_write_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original padova.receipt_allocations; outgoing padova.supplier_allocations;
BEGIN
 SELECT * INTO outgoing FROM padova.supplier_allocations WHERE id=NEW.allocation_id FOR UPDATE;
 IF FOUND THEN
  IF NEW.amount<=0 OR NEW.amount>padova.app_cents(outgoing.amount)-COALESCE((SELECT sum(amount) FROM padova.supplier_allocation_reversals WHERE allocation_id=outgoing.id),0) THEN RAISE EXCEPTION 'Allocation reversal exceeds original'; END IF;
  INSERT INTO padova.supplier_allocation_reversals(id,allocation_id,amount,command_id) VALUES(NEW.id,NEW.allocation_id,NEW.amount,NEW.command_id);
 ELSE
  SELECT * INTO STRICT original FROM padova.receipt_allocations WHERE id=NEW.allocation_id AND amount>0 FOR UPDATE;
  IF NEW.amount<=0 OR NEW.amount>padova.app_cents(original.amount+COALESCE((SELECT sum(amount) FROM padova.receipt_allocations WHERE reverses_id=original.id),0)) THEN RAISE EXCEPTION 'Allocation reversal exceeds original'; END IF;
  INSERT INTO padova.receipt_allocations(id,receipt_id,booking_id,amount,reverses_id,app_command_id) VALUES(NEW.id,original.receipt_id,original.booking_id,-NEW.amount::numeric/100,original.id,NEW.command_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION padova.app_write_reversal() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION padova.app_write_reversal() TO padova_app_server;

INSERT INTO padova.booking_source_methods(name,products,award,created_by) VALUES
 ('Direct Airline',ARRAY['Flight'],false,'system:production-entry-extension'),
 ('Direct Provider',ARRAY['Hotel','Car','Other'],false,'system:production-entry-extension') ON CONFLICT(name) DO NOTHING;
INSERT INTO padova.app_schema_versions(version) VALUES('20261102_targeted_entry_reliability');
