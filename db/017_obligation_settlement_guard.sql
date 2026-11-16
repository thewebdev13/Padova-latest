CREATE FUNCTION validate_obligation_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE obligation_amount bigint; allocated bigint;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(71280428);
 SELECT o.amount INTO obligation_amount FROM supplier_obligations o
 JOIN payment_allocations a ON a.id=NEW.allocation_id
 JOIN payments p ON p.id=a.payment_id
 WHERE o.id=NEW.obligation_id AND o.booking_id=a.booking_id AND o.supplier_id=p.party_id
 AND p.direction='supplier' AND a.command_id=NEW.command_id;
 IF obligation_amount IS NULL THEN RAISE EXCEPTION 'Seller allocation must match exact obligation, booking, seller and command'; END IF;
 SELECT COALESCE(sum(a.net_amount),0) INTO allocated FROM obligation_settlements s
 JOIN net_allocations a ON a.id=s.allocation_id WHERE s.obligation_id=NEW.obligation_id;
 IF allocated>obligation_amount THEN RAISE EXCEPTION 'Exact seller obligation is overallocated'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION validate_obligation_settlement() FROM PUBLIC;
CREATE TRIGGER exact_obligation_guard AFTER INSERT ON obligation_settlements FOR EACH ROW EXECUTE FUNCTION validate_obligation_settlement();
INSERT INTO schema_migrations(version) VALUES('017_obligation_settlement_guard');
