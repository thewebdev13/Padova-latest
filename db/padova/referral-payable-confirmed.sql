-- Additive Plan v1: referrer owed when commission is confirmed (QA/reviewed apply only).
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
