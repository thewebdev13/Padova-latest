-- Optional expected date is unknown until supplied, never inferred from travel.
ALTER TABLE commissions ALTER COLUMN due_on DROP NOT NULL;
INSERT INTO schema_migrations(version) VALUES('014_optional_commission_date');
