-- REVIEW ONLY: targeted extensions and compatibility views over existing ledgers.
-- Never run automatically. These statements are tested only in isolated local fixtures.
ALTER TABLE padova.web_sessions ADD COLUMN provider_state text;

-- Constraint broadening preserves all previously valid rows. Requires explicit review.
ALTER TABLE padova.parties DROP CONSTRAINT parties_kind_check;
ALTER TABLE padova.parties ADD CONSTRAINT parties_kind_check CHECK(kind IN ('person','company','supplier','intermediary','referrer','account_holder','family','partner'));
ALTER TABLE padova.receipts DROP CONSTRAINT receipts_kind_check;
ALTER TABLE padova.receipts ADD CONSTRAINT receipts_kind_check CHECK(kind IN ('customer','commission','voucher_sale','supplier_refund'));
ALTER TABLE padova.supplier_refunds ALTER COLUMN funding_id DROP NOT NULL;

ALTER TABLE padova.receipts ADD COLUMN app_account_id uuid REFERENCES padova.payment_accounts(id);
ALTER TABLE padova.receipts ADD COLUMN app_reference text;
ALTER TABLE padova.supplier_payments ADD COLUMN app_direction text;
ALTER TABLE padova.supplier_payments ADD COLUMN app_account_id uuid REFERENCES padova.payment_accounts(id);
ALTER TABLE padova.supplier_payments ADD COLUMN app_verification text;
ALTER TABLE padova.receipt_allocations ADD COLUMN app_command_id uuid;
ALTER TABLE padova.supplier_allocations ADD COLUMN app_command_id uuid;

CREATE VIEW padova.app_payments WITH(security_invoker=true) AS
 SELECT id,CASE kind WHEN 'voucher_sale' THEN 'asset_sale' ELSE kind END AS direction,payer_id AS party_id,padova.app_cents(amount) AS amount,received_date AS paid_on,method,COALESCE(app_reference,reference) AS reference,verification,app_account_id AS account_id,created_at FROM padova.receipts
 UNION ALL
 SELECT id,COALESCE(app_direction,'supplier'),payee_id,padova.app_cents(amount),paid_date,method,reference,COALESCE(app_verification,'Unverified'),app_account_id,created_at FROM padova.supplier_payments;
ALTER VIEW padova.app_payments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER VIEW padova.app_payments ALTER COLUMN reference SET DEFAULT '';
ALTER VIEW padova.app_payments ALTER COLUMN verification SET DEFAULT 'Unverified';
CREATE FUNCTION padova.app_write_payment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.amount<=0 THEN RAISE EXCEPTION 'Positive payment required'; END IF;
 IF NEW.direction IN ('customer','commission','asset_sale','supplier_refund') THEN
  INSERT INTO padova.receipts(id,payer_id,kind,amount,received_date,method,reference,app_reference,verification,app_account_id)
  VALUES(NEW.id,NEW.party_id,CASE NEW.direction WHEN 'asset_sale' THEN 'voucher_sale' ELSE NEW.direction END,NEW.amount::numeric/100,NEW.paid_on,NEW.method,COALESCE(NULLIF(NEW.reference,''),'APP-'||NEW.id),NEW.reference,NEW.verification,NEW.account_id);
 ELSIF NEW.direction IN ('supplier','referral','customer_refund','asset_purchase') THEN
  INSERT INTO padova.supplier_payments(id,payee_id,amount,paid_date,method,reference,app_direction,app_account_id,app_verification)
  VALUES(NEW.id,NEW.party_id,NEW.amount::numeric/100,NEW.paid_on,NEW.method,NEW.reference,NEW.direction,NEW.account_id,NEW.verification);
 ELSE RAISE EXCEPTION 'Unsupported payment direction'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT ON padova.app_payments FOR EACH ROW EXECUTE FUNCTION padova.app_write_payment();

CREATE VIEW padova.app_payment_allocations WITH(security_invoker=true) AS
 SELECT id,receipt_id AS payment_id,booking_id,padova.app_cents(amount) AS amount,app_command_id AS command_id FROM padova.receipt_allocations WHERE amount>0
 UNION ALL SELECT id,payment_id,booking_id,padova.app_cents(amount),app_command_id FROM padova.supplier_allocations;
ALTER VIEW padova.app_payment_allocations ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE FUNCTION padova.app_write_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE direction text; BEGIN
 SELECT p.direction INTO direction FROM padova.app_payments p WHERE id=NEW.payment_id;
 IF direction='customer' THEN INSERT INTO padova.receipt_allocations(id,receipt_id,booking_id,amount,app_command_id) VALUES(NEW.id,NEW.payment_id,NEW.booking_id,NEW.amount::numeric/100,NEW.command_id);
 ELSIF direction='supplier' THEN INSERT INTO padova.supplier_allocations(id,payment_id,booking_id,amount,app_command_id) VALUES(NEW.id,NEW.payment_id,NEW.booking_id,NEW.amount::numeric/100,NEW.command_id);
 ELSE RAISE EXCEPTION 'Only customer/supplier payments allocate to bookings'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT ON padova.app_payment_allocations FOR EACH ROW EXECUTE FUNCTION padova.app_write_allocation();

CREATE VIEW padova.app_payment_allocation_reversals WITH(security_invoker=true) AS SELECT id,reverses_id AS allocation_id,-padova.app_cents(amount) AS amount,app_command_id AS command_id FROM padova.receipt_allocations WHERE reverses_id IS NOT NULL;
ALTER VIEW padova.app_payment_allocation_reversals ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE FUNCTION padova.app_write_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE original padova.receipt_allocations; BEGIN
 SELECT * INTO STRICT original FROM padova.receipt_allocations WHERE id=NEW.allocation_id AND amount>0 FOR UPDATE;
 IF NEW.amount<=0 OR NEW.amount>padova.app_cents(original.amount+COALESCE((SELECT sum(amount) FROM padova.receipt_allocations WHERE reverses_id=original.id),0)) THEN RAISE EXCEPTION 'Allocation reversal exceeds original'; END IF;
 INSERT INTO padova.receipt_allocations(id,receipt_id,booking_id,amount,reverses_id,app_command_id) VALUES(NEW.id,original.receipt_id,original.booking_id,-NEW.amount::numeric/100,original.id,NEW.command_id); RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT ON padova.app_payment_allocation_reversals FOR EACH ROW EXECUTE FUNCTION padova.app_write_reversal();

-- Context adds command payload/journal linkage; requests remains the completed idempotency ledger.
CREATE TABLE padova.command_context(id uuid PRIMARY KEY,actor uuid NOT NULL REFERENCES auth.users(id),kind text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE VIEW padova.app_commands WITH(security_invoker=true) AS
 SELECT c.id,c.actor::text AS actor,c.kind,c.payload,r.result,c.created_at FROM padova.command_context c LEFT JOIN padova.requests r ON r.key=c.id
 UNION ALL SELECT r.key,r.actor::text,'legacy_rpc'::text,'{}'::jsonb,r.result,r.created_at FROM padova.requests r WHERE NOT EXISTS(SELECT 1 FROM padova.command_context c WHERE c.id=r.key);
CREATE FUNCTION padova.app_write_command() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM padova.requests WHERE key=NEW.id) THEN RAISE EXCEPTION 'Existing request key'; END IF;
  INSERT INTO padova.command_context(id,actor,kind,payload) VALUES(NEW.id,NEW.actor::uuid,NEW.kind,NEW.payload);
 ELSE
  IF OLD.result IS NOT NULL OR NEW.id<>OLD.id OR NEW.actor<>OLD.actor OR NEW.kind<>OLD.kind OR NEW.payload<>OLD.payload THEN RAISE EXCEPTION 'Posted command is immutable'; END IF;
  INSERT INTO padova.requests(key,actor,fingerprint,result) VALUES(NEW.id,NEW.actor::uuid,md5(NEW.kind||NEW.payload::text),NEW.result);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT OR UPDATE ON padova.app_commands FOR EACH ROW EXECUTE FUNCTION padova.app_write_command();

ALTER TABLE padova.supplier_refunds ADD COLUMN app_customer_refund_id uuid REFERENCES padova.customer_refunds(id);
ALTER TABLE padova.supplier_refunds ADD COLUMN app_traveler_id uuid REFERENCES padova.parties(id);
ALTER TABLE padova.supplier_refunds ADD COLUMN app_unit text;
ALTER TABLE padova.supplier_refunds ADD COLUMN app_expected_basis numeric(18,2);
ALTER TABLE padova.supplier_refunds ADD COLUMN app_due_on date;
ALTER TABLE padova.supplier_refunds ADD COLUMN app_reason text;
ALTER TABLE padova.supplier_refunds ADD COLUMN app_command_id uuid REFERENCES padova.command_context(id);
CREATE VIEW padova.app_refunds WITH(security_invoker=true) AS
 SELECT s.id,s.booking_id,s.app_traveler_id AS traveler_id,s.funding_id AS funding_component_id,
 CASE WHEN s.app_unit='points' THEN padova.app_whole(s.expected) ELSE padova.app_cents(s.expected) END AS supplier_expected,
 padova.app_cents(s.app_expected_basis) AS expected_basis,COALESCE(s.app_unit,'cents') AS unit,
 padova.app_cents(c.due) AS customer_due,s.app_due_on AS due_on,s.app_reason AS reason,s.app_command_id AS command_id
 FROM padova.supplier_refunds s LEFT JOIN padova.customer_refunds c ON c.id=s.app_customer_refund_id;
ALTER VIEW padova.app_refunds ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE FUNCTION padova.app_write_refund() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE cid uuid:=gen_random_uuid(); BEGIN
 INSERT INTO padova.customer_refunds(id,booking_id,payee_id,due,paid,retained_fee) SELECT cid,NEW.booking_id,b.customer_id,NEW.customer_due::numeric/100,0,0 FROM padova.bookings b WHERE b.id=NEW.booking_id;
 INSERT INTO padova.supplier_refunds(id,booking_id,funding_id,expected,received,returned_kind,requires_review,app_customer_refund_id,app_traveler_id,app_unit,app_expected_basis,app_due_on,app_reason,app_command_id)
 VALUES(NEW.id,NEW.booking_id,NEW.funding_component_id,CASE WHEN NEW.unit='points' THEN NEW.supplier_expected ELSE NEW.supplier_expected::numeric/100 END,0,'pending',true,cid,NEW.traveler_id,NEW.unit,NEW.expected_basis::numeric/100,NEW.due_on,NEW.reason,NEW.command_id); RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT ON padova.app_refunds FOR EACH ROW EXECUTE FUNCTION padova.app_write_refund();
CREATE TABLE padova.refund_movement_links(id uuid PRIMARY KEY,refund_id uuid NOT NULL REFERENCES padova.supplier_refunds(id),kind text NOT NULL,form text NOT NULL,incoming_payment_id uuid REFERENCES padova.receipts(id),outgoing_payment_id uuid REFERENCES padova.supplier_payments(id),asset_id uuid REFERENCES padova.assets(id),recognized_basis numeric(18,2) NOT NULL DEFAULT 0,command_id uuid NOT NULL REFERENCES padova.command_context(id));
CREATE VIEW padova.app_refund_movements WITH(security_invoker=true) AS
 SELECT l.id,l.refund_id,l.kind,l.form,
 CASE WHEN l.kind='supplier_received' AND r.app_unit='points' THEN padova.app_whole(s.amount) ELSE padova.app_cents(COALESCE(s.amount,c.amount)) END AS amount,
 COALESCE(l.incoming_payment_id,l.outgoing_payment_id) AS payment_id,l.asset_id,padova.app_cents(l.recognized_basis) AS recognized_basis,COALESCE(s.received_date,c.paid_date) AS effective_on,l.command_id
 FROM padova.refund_movement_links l JOIN padova.supplier_refunds r ON r.id=l.refund_id
 LEFT JOIN padova.supplier_refund_receipts s ON s.id=l.id AND l.kind='supplier_received'
 LEFT JOIN padova.customer_refund_payments c ON c.id=l.id AND l.kind<>'supplier_received';
ALTER VIEW padova.app_refund_movements ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER VIEW padova.app_refund_movements ALTER COLUMN recognized_basis SET DEFAULT 0;
CREATE FUNCTION padova.app_write_refund_movement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE r padova.supplier_refunds; BEGIN
 SELECT * INTO STRICT r FROM padova.supplier_refunds WHERE id=NEW.refund_id FOR UPDATE;
 IF NEW.kind='supplier_received' THEN
  INSERT INTO padova.supplier_refund_receipts(id,refund_id,amount,received_date,returned_kind,reference,requires_review) VALUES(NEW.id,NEW.refund_id,CASE WHEN r.app_unit='points' THEN NEW.amount ELSE NEW.amount::numeric/100 END,NEW.effective_on,NEW.form,'APP-'||NEW.id,NEW.form<>'cash');
 ELSIF NEW.kind IN ('customer_paid','customer_credit_handed_over') THEN
  INSERT INTO padova.customer_refund_payments(id,refund_id,amount,paid_date,method,reference) VALUES(NEW.id,r.app_customer_refund_id,NEW.amount::numeric/100,NEW.effective_on,NEW.form,'APP-'||NEW.id);
 ELSE RAISE EXCEPTION 'Unknown refund movement'; END IF;
 INSERT INTO padova.refund_movement_links VALUES(NEW.id,NEW.refund_id,NEW.kind,NEW.form,CASE WHEN NEW.kind='supplier_received' THEN NEW.payment_id END,CASE WHEN NEW.kind<>'supplier_received' THEN NEW.payment_id END,NEW.asset_id,NEW.recognized_basis::numeric/100,NEW.command_id); RETURN NEW;
END $$;
CREATE TRIGGER app_write INSTEAD OF INSERT ON padova.app_refund_movements FOR EACH ROW EXECUTE FUNCTION padova.app_write_refund_movement();

CREATE VIEW padova.app_net_allocations WITH(security_invoker=true) AS SELECT a.*,a.amount-COALESCE((SELECT sum(r.amount) FROM padova.app_payment_allocation_reversals r WHERE r.allocation_id=a.id),0)::bigint AS net_amount FROM padova.app_payment_allocations a;
CREATE VIEW padova.app_payment_balances WITH(security_invoker=true) AS SELECT p.*,p.amount+COALESCE((SELECT sum(delta) FROM padova.app_payment_adjustments a WHERE a.payment_id=p.id),0)::bigint AS current_amount,COALESCE((SELECT sum(net_amount) FROM padova.app_net_allocations a WHERE a.payment_id=p.id),0)::bigint AS allocated,COALESCE((SELECT sum(amount) FROM padova.app_commission_allocations a WHERE a.payment_id=p.id),0)::bigint AS commission_allocated FROM padova.app_payments p;
CREATE VIEW padova.app_asset_balances WITH(security_invoker=true) AS SELECT a.*,COALESCE((SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,COALESCE((SELECT sum(basis) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS remaining_basis FROM padova.app_assets a;
CREATE VIEW padova.app_booking_balances WITH(security_invoker=true) AS SELECT b.*,
 (SELECT sum(amount)::bigint FROM padova.app_charges c WHERE c.booking_id=b.id) AS sale,
 COALESCE((SELECT sum(a.net_amount) FROM padova.app_net_allocations a JOIN padova.app_payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='customer'),0)::bigint AS paid,
 COALESCE((SELECT sum(cost) FROM padova.app_funding_components f WHERE f.booking_id=b.id),0)::bigint AS funding_cost,
 COALESCE((SELECT sum(amount) FROM padova.app_supplier_obligations o WHERE o.booking_id=b.id),0)::bigint AS obligations,
 COALESCE((SELECT sum(a.net_amount) FROM padova.app_net_allocations a JOIN padova.app_payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='supplier'),0)::bigint AS supplier_paid,
 COALESCE((SELECT sum(gross-retained) FROM padova.app_commissions c WHERE c.booking_id=b.id),0)::bigint AS expected_commission,
 (SELECT sum(amount)::bigint FROM padova.app_profit_movements m WHERE m.booking_id=b.id) AS profit,
 COALESCE((SELECT sum(customer_due) FROM padova.app_refunds r WHERE r.booking_id=b.id),0)::bigint AS refund_due FROM padova.app_bookings b;
