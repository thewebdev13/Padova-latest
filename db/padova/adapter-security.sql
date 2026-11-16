-- REVIEW ONLY. Narrow existing-RPC access restrictions, no function replacements/data writes.
-- Old RPCs do not enforce granular grants. Both direct private calls and wrappers must close.
REVOKE EXECUTE ON FUNCTION public.padova_activate_owner(),public.padova_booking_detail(uuid),public.padova_command(text,jsonb,uuid),public.padova_historical_bookings(text,integer),public.padova_historical_directory(text,integer),public.padova_manage_staff(text,boolean),public.padova_read(text,text,integer),public.padova_references() FROM authenticated;
REVOKE EXECUTE ON FUNCTION padova.booking_detail(uuid),padova.command(text,jsonb,uuid),padova.manage_staff(text,boolean),padova.read_data(text,text,integer) FROM authenticated;

CREATE FUNCTION padova.app_verify_journal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF (SELECT COALESCE(sum(debit-credit),0) FROM padova.journal_lines WHERE command_id=NEW.command_id)<>0 THEN RAISE EXCEPTION 'Unbalanced journal transaction'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER app_balanced_journal AFTER INSERT ON padova.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION padova.app_verify_journal();
CREATE FUNCTION padova.app_verify_inventory() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE qty bigint;basis numeric; BEGIN
 IF NEW.app_lot_id IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(sum(app_quantity),0),COALESCE(sum(basis_delta),0) INTO qty,basis FROM padova.asset_movements WHERE app_lot_id=NEW.app_lot_id;
 IF qty<0 OR basis<0 OR (qty=0 AND basis<>0) THEN RAISE EXCEPTION 'Invalid inventory lot quantity or basis'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER app_valid_inventory AFTER INSERT ON padova.asset_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION padova.app_verify_inventory();
CREATE FUNCTION padova.app_verify_command() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.requests WHERE key=NEW.id) THEN RAISE EXCEPTION 'Command was not completed atomically'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER app_completed_command AFTER INSERT ON padova.command_context DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION padova.app_verify_command();

-- Isolated application server role: no login credential is created, no RLS bypass.
CREATE ROLE padova_app_server NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA padova TO padova_app_server;
-- Explicit object grants/policies are generated below from the reviewed adapter manifest.
