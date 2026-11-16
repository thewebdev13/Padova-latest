-- Exact seller cost can be known while the seller-owned value quantity is unknown.
ALTER TABLE fulfillment_details ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE fulfillment_details ADD CONSTRAINT owned_quantity_required CHECK(mode='Outside source' OR quantity IS NOT NULL);
INSERT INTO schema_migrations(version) VALUES('015_unknown_outside_quantity');
