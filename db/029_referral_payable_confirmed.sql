-- Plan v1: referrer owed when commission is confirmed (not only when cash received).
ALTER TABLE commission_payable_revisions
  DROP CONSTRAINT IF EXISTS commission_payable_revisions_payable_when_check;
ALTER TABLE commission_payable_revisions
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
