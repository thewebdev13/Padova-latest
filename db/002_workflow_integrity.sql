CREATE TABLE booking_payers (booking_id uuid NOT NULL REFERENCES bookings(id), party_id uuid NOT NULL REFERENCES parties(id),
 reason text NOT NULL, command_id uuid NOT NULL REFERENCES commands(id), PRIMARY KEY(booking_id,party_id));
CREATE TABLE asset_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sending_asset_id uuid NOT NULL REFERENCES assets(id),
 receiving_asset_id uuid NOT NULL REFERENCES assets(id), quantity_sent bigint NOT NULL CHECK(quantity_sent>0),
 quantity_received bigint NOT NULL CHECK(quantity_received>0), basis bigint NOT NULL CHECK(basis>=0), fees bigint NOT NULL CHECK(fees>=0),
 effective_on date NOT NULL, command_id uuid NOT NULL REFERENCES commands(id), CHECK(sending_asset_id<>receiving_asset_id));
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON booking_payers FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON asset_transfers FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
ALTER TABLE refunds ADD COLUMN unit text NOT NULL DEFAULT 'cents' CHECK(unit IN ('cents','points'));
ALTER TABLE refunds ADD COLUMN expected_basis bigint NOT NULL DEFAULT 0 CHECK(expected_basis>=0);
CREATE TABLE asset_sale_receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES asset_sales(id),
 payment_id uuid NOT NULL REFERENCES payments(id), amount bigint NOT NULL CHECK(amount>0), command_id uuid NOT NULL REFERENCES commands(id));
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON asset_sale_receipts FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE INDEX supplier_obligation_counterparty_idx ON supplier_obligations(supplier_id,booking_id);
CREATE INDEX refund_component_idx ON refunds(funding_component_id);
INSERT INTO schema_migrations(version) VALUES('002_workflow_integrity');
