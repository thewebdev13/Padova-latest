-- Plan v1 Phase 4: in-app invoice drafts (preview → Owner approve → mark sent). No auto-email.
CREATE TABLE invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES parties(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'voided')),
  customer_name text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  total_cents bigint,
  incomplete boolean NOT NULL DEFAULT false,
  booking_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES staff(id),
  approved_by uuid REFERENCES staff(id),
  approved_at timestamptz,
  sent_by uuid REFERENCES staff(id),
  sent_at timestamptz,
  voided_by uuid REFERENCES staff(id),
  voided_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_drafts_customer_idx ON invoice_drafts(customer_id, created_at DESC);
ALTER TABLE invoice_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_drafts FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('026_invoice_drafts');
