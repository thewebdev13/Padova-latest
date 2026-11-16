CREATE TABLE asset_acquisition_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id),
 payment_id uuid NOT NULL REFERENCES payments(id), amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON asset_acquisition_payments FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
INSERT INTO schema_migrations(version) VALUES('003_settlements');
