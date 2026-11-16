CREATE TABLE payment_allocation_reversals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), allocation_id uuid NOT NULL REFERENCES payment_allocations(id),
 amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON payment_allocation_reversals FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE VIEW net_allocations AS SELECT a.*,a.amount-COALESCE((SELECT sum(r.amount) FROM payment_allocation_reversals r WHERE r.allocation_id=a.id),0)::bigint net_amount FROM payment_allocations a;
CREATE OR REPLACE VIEW payment_balances AS SELECT p.*,p.amount+COALESCE((SELECT sum(delta) FROM payment_adjustments a WHERE a.payment_id=p.id),0)::bigint current_amount,
 COALESCE((SELECT sum(net_amount) FROM net_allocations a WHERE a.payment_id=p.id),0)::bigint allocated,
 COALESCE((SELECT sum(amount) FROM commission_allocations a WHERE a.payment_id=p.id),0)::bigint commission_allocated FROM payments p;
CREATE OR REPLACE VIEW booking_balances AS SELECT b.*,
 COALESCE((SELECT sum(amount) FROM charges c WHERE c.booking_id=b.id),0)::bigint sale,
 COALESCE((SELECT sum(a.net_amount) FROM net_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='customer'),0)::bigint paid,
 COALESCE((SELECT sum(cost) FROM funding_components f WHERE f.booking_id=b.id),0)::bigint funding_cost,
 COALESCE((SELECT sum(amount) FROM supplier_obligations o WHERE o.booking_id=b.id),0)::bigint obligations,
 COALESCE((SELECT sum(a.net_amount) FROM net_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=b.id AND p.direction='supplier'),0)::bigint supplier_paid,
 COALESCE((SELECT sum(gross-retained) FROM commissions c WHERE c.booking_id=b.id),0)::bigint expected_commission,
 COALESCE((SELECT sum(amount) FROM profit_movements m WHERE m.booking_id=b.id),0)::bigint profit,
 COALESCE((SELECT sum(customer_due) FROM refunds r WHERE r.booking_id=b.id),0)::bigint refund_due FROM bookings b;
ALTER TABLE payment_allocation_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_allocation_reversals,net_allocations FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('005_allocation_reversals');
