ALTER TABLE staff ADD COLUMN role text NOT NULL DEFAULT 'EMPLOYEE' CHECK(role IN ('OWNER','EMPLOYEE'));
ALTER TABLE staff ADD COLUMN auth_version integer NOT NULL DEFAULT 1;
ALTER TABLE staff ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE staff SET role='OWNER' WHERE 'admin'=ANY(permissions);
UPDATE staff SET permissions=ARRAY(SELECT DISTINCT p FROM unnest(
 CASE WHEN 'operations'=ANY(permissions) THEN ARRAY['operations'] ELSE ARRAY[]::text[] END ||
 CASE WHEN 'payments'=ANY(permissions) THEN ARRAY['edit_payments'] ELSE ARRAY[]::text[] END ||
 CASE WHEN 'sensitive'=ANY(permissions) THEN ARRAY['view_traveler_sensitive'] ELSE ARRAY[]::text[] END ||
 CASE WHEN 'finance'=ANY(permissions) THEN ARRAY['view_sale_price','view_supplier_cost','view_booking_profit','view_total_profit','view_asset_basis','view_accounting','edit_customer_charges','manage_funding','view_refunds','issue_refunds','view_commissions','manage_commissions','manage_assets','edit_completed_bookings','view_audit'] ELSE ARRAY[]::text[] END ||
 CASE WHEN 'admin'=ANY(permissions) THEN ARRAY['manage_users','manage_settings'] ELSE ARRAY[]::text[] END) AS p);
CREATE UNIQUE INDEX staff_email_casefold_idx ON staff(lower(email));
ALTER TABLE sessions ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
DELETE FROM sessions; -- Reauthenticate all legacy sessions under the new permission model.
CREATE TABLE recovery_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL REFERENCES staff(id),requested_at timestamptz NOT NULL DEFAULT now(),handled_at timestamptz);
CREATE TABLE password_reset_tokens(token_hash text PRIMARY KEY,staff_id uuid NOT NULL REFERENCES staff(id),issued_by uuid NOT NULL REFERENCES staff(id),auth_version integer NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_throttles(bucket_hash text PRIMARY KEY,attempts integer NOT NULL,window_start timestamptz NOT NULL);
CREATE TABLE security_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES staff(id),actor_name text NOT NULL,target_id uuid REFERENCES staff(id),action text NOT NULL,before_value jsonb,after_value jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_security_history BEFORE UPDATE OR DELETE ON security_audit FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE INDEX security_audit_target_idx ON security_audit(target_id,created_at);
CREATE INDEX recovery_pending_idx ON recovery_requests(requested_at) WHERE handled_at IS NULL;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['recovery_requests','password_reset_tokens','auth_throttles','security_audit'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',t); END IF;
 END LOOP;END $$;
INSERT INTO schema_migrations(version) VALUES('008_individual_auth');
