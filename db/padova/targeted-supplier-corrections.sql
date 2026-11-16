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
