CREATE FUNCTION verify_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT COALESCE(sum(debit-credit),0) FROM journal_lines WHERE command_id=NEW.command_id)<>0 THEN
  RAISE EXCEPTION 'Unbalanced journal transaction';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_journal_balance();
CREATE FUNCTION verify_inventory_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qty bigint; basis_value bigint; BEGIN
 SELECT COALESCE(sum(quantity),0),COALESCE(sum(basis),0) INTO qty,basis_value FROM asset_movements WHERE lot_id=NEW.lot_id;
 IF qty<0 OR basis_value<0 OR (qty=0 AND basis_value<>0) THEN RAISE EXCEPTION 'Invalid inventory balance or basis'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER valid_inventory AFTER INSERT ON asset_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_balance();
CREATE FUNCTION guard_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.result IS NOT NULL THEN RAISE EXCEPTION 'Posted command is immutable'; END IF;
 IF NEW.id<>OLD.id OR NEW.actor<>OLD.actor OR NEW.kind<>OLD.kind OR NEW.payload<>OLD.payload OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Command identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_command BEFORE UPDATE OR DELETE ON commands FOR EACH ROW EXECUTE FUNCTION guard_command();
REVOKE ALL ON FUNCTION verify_journal_balance(),verify_inventory_balance(),guard_command() FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('006_deferred_guards');
