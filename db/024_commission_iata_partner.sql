-- Site Feedback 3 Phase 2: persist IATA-partner mark on each commission receivable (not UI-only).
-- Synthetic/local fixture. Cloud extension is additive via reviewed padova process — never auto-apply to production.
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS is_iata_partner boolean NOT NULL DEFAULT false;
INSERT INTO schema_migrations(version) VALUES('024_commission_iata_partner');
