-- Extend the existing referral payable ledger; preserve every original agreement/payment.
ALTER TABLE referrals DROP CONSTRAINT referrals_booking_id_key;
CREATE TABLE commission_payable_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_id uuid NOT NULL REFERENCES referrals(id),
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
 command_id uuid NOT NULL REFERENCES commands(id),
 UNIQUE(referral_id,revision),
 CHECK(calculation='fixed' OR percentage_basis<>'agreed_amount' OR agreed_basis IS NOT NULL),
 CHECK(NOT earned OR earned_on IS NOT NULL)
);
CREATE INDEX commission_payable_revisions_latest ON commission_payable_revisions(referral_id,revision DESC);
CREATE INDEX referrals_booking ON referrals(booking_id);
ALTER TABLE commission_payable_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_payable_revisions FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON commission_payable_revisions FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TABLE commission_payout_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES payments(id),
 delta bigint NOT NULL CHECK(delta<0),
 reason text NOT NULL CHECK(length(trim(reason))>0),
 command_id uuid NOT NULL REFERENCES commands(id)
);
CREATE INDEX commission_payout_adjustments_payment ON commission_payout_adjustments(payment_id);
ALTER TABLE commission_payout_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_payout_adjustments FROM PUBLIC;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON commission_payout_adjustments FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE OR REPLACE VIEW payment_balances AS SELECT p.*,
 p.amount+COALESCE((SELECT sum(delta) FROM payment_adjustments a WHERE a.payment_id=p.id),0)::bigint
 +COALESCE((SELECT sum(delta) FROM commission_payout_adjustments a WHERE a.payment_id=p.id),0)::bigint AS current_amount,
 COALESCE((SELECT sum(net_amount) FROM net_allocations a WHERE a.payment_id=p.id),0)::bigint AS allocated,
 COALESCE((SELECT sum(amount) FROM commission_allocations a WHERE a.payment_id=p.id),0)::bigint AS commission_allocated FROM payments p;
-- Local fixture roles; hosted roles are prepared separately.
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON commission_payable_revisions,commission_payout_adjustments FROM %I',role_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_api') THEN
  GRANT SELECT,INSERT ON commission_payable_revisions,commission_payout_adjustments TO padova_api;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('019_commission_payables');
