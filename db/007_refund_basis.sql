ALTER TABLE refund_movements ADD COLUMN recognized_basis bigint NOT NULL DEFAULT 0 CHECK(recognized_basis>=0);
ALTER TABLE net_allocations SET (security_invoker=true);
ALTER TABLE payment_balances SET (security_invoker=true);
ALTER TABLE asset_balances SET (security_invoker=true);
ALTER TABLE booking_balances SET (security_invoker=true);
INSERT INTO schema_migrations(version) VALUES('007_refund_basis');
