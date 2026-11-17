-- PREPARED ONLY until applied on a reviewed host.
-- Additive Site Feedback 3: persist is_iata_partner on each commission receivable.
-- Updates padova.commissions + app_commissions view/write path (adapter already installed).
-- Never reinstalls the adapter. No financial posting / gate / Auth changes.
-- Apply on QA first (cnpyvmhgbtyleckyirye). Production US padova only after Owner OK + backup.
BEGIN;
SET LOCAL search_path = padova, pg_catalog;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM padova.app_schema_versions WHERE version = '20261028_existing_padova_adapter'
  ) THEN
    RAISE EXCEPTION 'Existing adapter required; never reinstall it';
  END IF;
  IF EXISTS (
    SELECT 1 FROM padova.app_schema_versions WHERE version = '20261117_commission_iata_partner'
  ) THEN
    RAISE EXCEPTION 'Commission IATA partner extension already installed; do not reinstall';
  END IF;
END $$;

ALTER TABLE padova.commissions
  ADD COLUMN IF NOT EXISTS is_iata_partner boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW padova.app_commissions WITH (security_invoker = true) AS
SELECT
  b.id AS id,
  b.booking_id AS booking_id,
  COALESCE(b.app_payer_id, b.intermediary_id) AS payer_id,
  b.app_collector_id AS collector_id,
  padova.app_cents(b.gross) AS gross,
  padova.app_cents(b.retention) AS retained,
  COALESCE(b.app_due_on, b.stay_end + 30) AS due_on,
  b.app_command_id AS command_id,
  COALESCE(b.is_iata_partner, false) AS is_iata_partner
FROM padova.commissions b;

ALTER VIEW padova.app_commissions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER VIEW padova.app_commissions ALTER COLUMN is_iata_partner SET DEFAULT false;

CREATE OR REPLACE FUNCTION padova.app_write_commissions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO padova.commissions (
      id,
      booking_id,
      app_payer_id,
      app_collector_id,
      gross,
      retention,
      app_due_on,
      app_command_id,
      intermediary_id,
      stay_end,
      is_iata_partner
    ) VALUES (
      NEW.id,
      NEW.booking_id,
      NEW.payer_id,
      NEW.collector_id,
      NEW.gross::numeric / 100,
      NEW.retained::numeric / 100,
      NEW.due_on,
      NEW.command_id,
      COALESCE(NEW.collector_id, NEW.payer_id),
      COALESCE((SELECT end_date FROM padova.bookings WHERE id = NEW.booking_id), NEW.due_on),
      COALESCE(NEW.is_iata_partner, false)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE padova.commissions SET
      booking_id = NEW.booking_id,
      app_payer_id = NEW.payer_id,
      app_collector_id = NEW.collector_id,
      gross = NEW.gross::numeric / 100,
      retention = NEW.retained::numeric / 100,
      app_due_on = NEW.due_on,
      app_command_id = NEW.command_id,
      intermediary_id = COALESCE(NEW.collector_id, NEW.payer_id),
      stay_end = COALESCE((SELECT end_date FROM padova.bookings WHERE id = NEW.booking_id), NEW.due_on),
      is_iata_partner = COALESCE(NEW.is_iata_partner, false)
    WHERE id = OLD.id;
  ELSE
    RAISE EXCEPTION 'Adapter deletion is not permitted';
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO padova.app_schema_versions(version) VALUES ('20261117_commission_iata_partner');
COMMIT;
