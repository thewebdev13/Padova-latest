-- Owner decision, 29 October: an actual owned rebate reversal may expose a deficit.
-- Extends only the installed US padova adapter. No evidence/backfill/financial writes.
DO $$ BEGIN
 PERFORM pg_advisory_xact_lock(71280428);
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_fulfillment_catalogs_units') THEN RAISE EXCEPTION 'Installed fulfillment extension required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_owned_reward_reversal_positions') THEN RAISE EXCEPTION 'Reward reversal extension already installed; do not reinstall'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='padova.app_verify_inventory()'::regprocedure)<>'c64a4b74a4a5e8cdf78b498d464d034b' THEN RAISE EXCEPTION 'Existing inventory guard differs from reviewed preflight'; END IF;
END $$;
CREATE OR REPLACE FUNCTION padova.app_verify_inventory() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE qty bigint; basis numeric; original padova.asset_movements%ROWTYPE; BEGIN
 IF NEW.app_lot_id IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(sum(app_quantity),0),COALESCE(sum(basis_delta),0) INTO qty,basis
 FROM padova.asset_movements WHERE app_lot_id=NEW.app_lot_id;
 IF qty<0 OR basis<0 OR (qty=0 AND basis<>0) THEN
   SELECT * INTO original FROM padova.asset_movements WHERE id=NEW.app_original_movement_id;
   IF NEW.app_kind IS DISTINCT FROM 'points_rebate_reversal' OR original.id IS NULL OR original.app_kind IS DISTINCT FROM 'points_rebate'
      OR original.asset_id IS DISTINCT FROM NEW.asset_id OR original.app_lot_id IS DISTINCT FROM NEW.app_lot_id
      OR NEW.app_quantity IS DISTINCT FROM -original.app_quantity OR NEW.basis_delta IS DISTINCT FROM -original.basis_delta
      OR NOT EXISTS(SELECT 1 FROM padova.app_assets a WHERE a.id=NEW.asset_id AND a.ownership='Padova')
      OR NOT EXISTS(SELECT 1 FROM padova.app_commands c WHERE c.id=NEW.app_command_id AND c.kind='update_expected_event' AND c.payload->>'status'='Reversed')
      OR EXISTS(SELECT 1 FROM padova.asset_movements m WHERE m.app_original_movement_id=original.id AND m.app_kind='points_rebate_reversal' AND m.id<>NEW.id)
   THEN RAISE EXCEPTION 'Invalid inventory lot quantity or basis'; END IF;
 END IF; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION padova.app_verify_inventory() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION padova.app_verify_inventory() TO padova_app_server;
INSERT INTO padova.app_schema_versions(version) VALUES('20261029_owned_reward_reversal_positions');
