/**
 * Reviewed additive QA SQL embedded for serverless (db/padova is not in /var/task).
 * Keep in sync with db/padova/*.sql — never include adapter/reinstall scripts.
 */

export const QA_SCHEMA_SCRIPTS = {
  'booking-relations': `-- Additive Plan v1 related bookings (QA/reviewed apply only; never reinstall adapter).
CREATE TABLE IF NOT EXISTS padova.booking_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_booking_id uuid NOT NULL,
  to_booking_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN (
      'Change / extension',
      'Rebooking after cancel',
      'Voucher issued from',
      'Voucher used on',
      'Same trip',
      'Other'
    )),
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  CHECK (from_booking_id <> to_booking_id)
);
CREATE INDEX IF NOT EXISTS booking_relations_from_idx
  ON padova.booking_relations(from_booking_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_relations_to_idx
  ON padova.booking_relations(to_booking_id) WHERE voided_at IS NULL;
ALTER TABLE padova.booking_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_server ON padova.booking_relations;
CREATE POLICY app_server ON padova.booking_relations TO padova_app_server USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON padova.booking_relations TO padova_app_server;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_booking_relations')
  ON CONFLICT (version) DO NOTHING;
`,
  'invoice-drafts': `-- Additive Plan v1 invoice drafts (QA/reviewed apply only; never reinstall adapter).
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
`,
  'fee-settings': `-- Additive Plan v1 fee defaults (QA/reviewed apply only; never reinstall adapter).
-- Customer card fee ~2.9%; Padova processor ~2.7% + $0.30 — both editable.
CREATE TABLE IF NOT EXISTS padova.fee_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  customer_card_fee_bps integer NOT NULL DEFAULT 290 CHECK (customer_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_bps integer NOT NULL DEFAULT 270 CHECK (padova_card_fee_bps BETWEEN 0 AND 10000),
  padova_card_fee_flat_cents bigint NOT NULL DEFAULT 30 CHECK (padova_card_fee_flat_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO padova.fee_settings (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE padova.fee_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_server ON padova.fee_settings;
CREATE POLICY app_server ON padova.fee_settings TO padova_app_server USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON padova.fee_settings TO padova_app_server;
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_fee_settings')
  ON CONFLICT (version) DO NOTHING;
`,
  'referral-payable-confirmed': `-- Additive Plan v1: referrer owed when commission is confirmed (QA/reviewed apply only).
ALTER TABLE padova.commission_payable_revisions
  DROP CONSTRAINT IF EXISTS commission_payable_revisions_payable_when_check;
ALTER TABLE padova.commission_payable_revisions
  ADD CONSTRAINT commission_payable_revisions_payable_when_check
  CHECK (
    payable_when IN (
      'When earned',
      'After travel',
      'After customer paid',
      'After commission confirmed',
      'After commission received',
      'On date'
    )
  );
INSERT INTO padova.app_schema_versions(version)
  VALUES ('20261125_referral_payable_confirmed')
  ON CONFLICT (version) DO NOTHING;
`,
} as const;

export type QaSchemaScript = keyof typeof QA_SCHEMA_SCRIPTS;
