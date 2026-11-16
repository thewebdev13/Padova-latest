-- Synthetic/local fixture. The cloud extension is prepared separately; never auto-apply to production.
ALTER TABLE asset_lots ALTER COLUMN cost DROP NOT NULL;
ALTER TABLE asset_movements ALTER COLUMN basis DROP NOT NULL;
ALTER TABLE funding_components ALTER COLUMN cost DROP NOT NULL;
ALTER TABLE refund_movements ALTER COLUMN recognized_basis DROP NOT NULL;
ALTER TABLE refunds ALTER COLUMN expected_basis DROP NOT NULL;
CREATE OR REPLACE VIEW asset_balances AS SELECT a.id,a.name,a.kind,a.issuer,a.holder_id,a.seller_id,a.source_booking_id,a.ownership,a.expires_on,a.restrictions,a.reference,a.created_at,
 COALESCE((SELECT sum(quantity) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 CASE WHEN EXISTS(SELECT 1 FROM asset_lots l WHERE l.asset_id=a.id AND l.cost IS NULL AND (SELECT sum(quantity) FROM asset_movements m WHERE m.lot_id=l.id)>0) THEN NULL ELSE COALESCE((SELECT sum(basis) FROM asset_movements m WHERE m.asset_id=a.id),0)::bigint END AS remaining_basis,a.unit FROM assets a;
INSERT INTO booking_source_methods(name,products,award,created_by) VALUES
 ('Direct Airline',ARRAY['Flight'],false,'system:targeted-entry'),
 ('Direct Provider',ARRAY['Hotel','Car','Other'],false,'system:targeted-entry') ON CONFLICT(name) DO NOTHING;
INSERT INTO schema_migrations(version) VALUES('020_targeted_entry_reliability');
