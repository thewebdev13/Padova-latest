-- Plan invoice send metadata: sent_to + Owner WhatsApp copy noted (never auto-WA).
ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS sent_to text;
ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS whatsapp_copy_noted_at timestamptz;
INSERT INTO schema_migrations(version) VALUES('030_invoice_send_fields');
