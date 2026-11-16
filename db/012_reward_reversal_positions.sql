-- Local synthetic fixture only. Preserve the normal nonnegative lot guard;
-- permit only an exact, authenticated-command-linked reversal of a real rebate
-- to expose the operational deficit approved by the Owner on 29 October.
CREATE OR REPLACE FUNCTION verify_inventory_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qty bigint; basis_value bigint; original asset_movements%ROWTYPE; BEGIN
 SELECT COALESCE(sum(quantity),0),COALESCE(sum(basis),0) INTO qty,basis_value
 FROM asset_movements WHERE lot_id=NEW.lot_id;
 IF qty<0 OR basis_value<0 OR (qty=0 AND basis_value<>0) THEN
   SELECT * INTO original FROM asset_movements WHERE id=NEW.original_movement_id;
   IF NEW.kind<>'points_rebate_reversal' OR original.id IS NULL OR original.kind<>'points_rebate'
      OR original.asset_id<>NEW.asset_id OR original.lot_id<>NEW.lot_id
      OR NEW.quantity<>-original.quantity OR NEW.basis<>-original.basis
      OR NOT EXISTS(SELECT 1 FROM assets a WHERE a.id=NEW.asset_id AND a.ownership='Padova')
      OR NOT EXISTS(SELECT 1 FROM commands c WHERE c.id=NEW.command_id AND c.kind='update_expected_event' AND c.payload->>'status'='Reversed')
      OR EXISTS(SELECT 1 FROM asset_movements m WHERE m.original_movement_id=original.id AND m.kind='points_rebate_reversal' AND m.id<>NEW.id)
   THEN RAISE EXCEPTION 'Invalid inventory balance or basis'; END IF;
 END IF; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION verify_inventory_balance() FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('012_reward_reversal_positions');
