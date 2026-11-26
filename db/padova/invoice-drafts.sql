-- Additive Plan v1 invoice drafts (QA/reviewed apply only; never reinstall adapter).
CREATE TABLE IF NOT EXISTS padova.invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'voided')),
  customer_name text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  total_cents bigint,
  incomplete boolean NOT NULL DEFAULT false,
  booking_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  sent_by uuid,
  sent_at timestamptz,
  voided_by uuid,
  voided_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_drafts_customer_idx
  ON padova.invoice_drafts(customer_id, created_at DESC);
ALTER TABLE padova.invoice_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_server ON padova.invoice_drafts;
CREATE POLICY app_server ON padova.invoice_drafts TO padova_app_server USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON padova.invoice_drafts TO padova_app_server;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_invoice_drafts')
  ON CONFLICT (version) DO NOTHING;
