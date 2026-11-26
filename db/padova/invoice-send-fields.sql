-- Additive Plan send fields (reviewed QA apply only; never reinstall adapter).
ALTER TABLE padova.invoice_drafts ADD COLUMN IF NOT EXISTS sent_to text;
ALTER TABLE padova.invoice_drafts ADD COLUMN IF NOT EXISTS whatsapp_copy_noted_at timestamptz;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261126_invoice_send_fields')
  ON CONFLICT (version) DO NOTHING;
