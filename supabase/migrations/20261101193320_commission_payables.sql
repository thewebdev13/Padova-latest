-- PREPARED ONLY. Reuse installed US adapter; no backfill, historical posting, authentication or gate changes.
-- Extend the existing referral payable ledger; preserve every original agreement/payment.
ALTER TABLE padova.referral_terms DROP CONSTRAINT referral_terms_booking_id_key;
CREATE TABLE padova.commission_payable_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_id uuid NOT NULL REFERENCES padova.referral_terms(id),
 revision integer NOT NULL CHECK(revision>0),
 calculation text NOT NULL CHECK(calculation IN ('fixed','percentage')),
 percentage_basis text NOT NULL CHECK(percentage_basis IN ('profit','sale','commission','commission_received','agreed_amount')),
 rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 fixed_amount bigint NOT NULL CHECK(fixed_amount>=0),
 agreed_basis bigint CHECK(agreed_basis>=0),
 earned boolean NOT NULL,
 earned_on date,
 payable_when text NOT NULL CHECK(payable_when IN ('When earned','After travel','After customer paid','After commission received','On date')),
 due_on date NOT NULL,
 active boolean NOT NULL DEFAULT true,
 cancellation_rule text NOT NULL CHECK(cancellation_rule IN ('Realized economics','Retain agreed amount')),
 reason text NOT NULL CHECK(length(trim(reason))>0),
 effective_on date NOT NULL,
 command_id uuid NOT NULL REFERENCES padova.command_context(id),
 UNIQUE(referral_id,revision),
 CHECK(calculation='fixed' OR percentage_basis<>'agreed_amount' OR agreed_basis IS NOT NULL),
 CHECK(NOT earned OR earned_on IS NOT NULL)
);
CREATE INDEX commission_payable_revisions_latest ON padova.commission_payable_revisions(referral_id,revision DESC);
CREATE INDEX referrals_booking ON padova.referral_terms(booking_id);
ALTER TABLE padova.commission_payable_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.commission_payable_revisions FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.commission_payable_revisions FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE TABLE padova.commission_payout_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES padova.supplier_payments(id),
 delta bigint NOT NULL CHECK(delta<0),
 reason text NOT NULL CHECK(length(trim(reason))>0),
 command_id uuid NOT NULL REFERENCES padova.command_context(id)
);
CREATE INDEX commission_payout_adjustments_payment ON padova.commission_payout_adjustments(payment_id);
ALTER TABLE padova.commission_payout_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.commission_payout_adjustments FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.commission_payout_adjustments FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
CREATE OR REPLACE VIEW padova.app_payment_balances WITH(security_invoker=true) AS SELECT p.*,p.amount+COALESCE((SELECT sum(delta) FROM padova.app_payment_adjustments a WHERE a.payment_id=p.id),0)::bigint+COALESCE((SELECT sum(delta) FROM padova.commission_payout_adjustments a WHERE a.payment_id=p.id),0)::bigint AS current_amount,COALESCE((SELECT sum(net_amount) FROM padova.app_net_allocations a WHERE a.payment_id=p.id),0)::bigint AS allocated,COALESCE((SELECT sum(amount) FROM padova.app_commission_allocations a WHERE a.payment_id=p.id),0)::bigint AS commission_allocated FROM padova.app_payments p;

REVOKE ALL ON padova.commission_payable_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.commission_payable_revisions TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.commission_payable_revisions TO padova_app_server;
REVOKE ALL ON padova.commission_payout_adjustments FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.commission_payout_adjustments TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.commission_payout_adjustments TO padova_app_server;
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.commission_payable_revisions FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.commission_payout_adjustments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.commission_payable_revisions TO padova_backup; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.commission_payout_adjustments TO padova_backup; END IF; END $$;
INSERT INTO padova.app_schema_versions(version) VALUES('20261101_commission_payables');
