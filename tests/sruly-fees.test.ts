import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SRULY_FEE_PRESETS,
  SRULY_PNR_FEE_CENTS,
  SRULY_VOUCHER_EXTRA_FEE_CENTS,
  centsToUsdInput,
  srulyFeePresetById,
} from '../src/lib/sruly-fees';

test('Sruly fee presets are optional fixed cents (never auto)', () => {
  assert.equal(SRULY_PNR_FEE_CENTS, 5000);
  assert.equal(SRULY_VOUCHER_EXTRA_FEE_CENTS, 3000);
  assert.equal(srulyFeePresetById('pnr_50')?.amount_cents, 5000);
  assert.equal(srulyFeePresetById('voucher_30')?.amount_cents, 3000);
  assert.equal(srulyFeePresetById('pnr_and_voucher')?.amount_cents, 8000);
  assert.equal(SRULY_FEE_PRESETS.length, 3);
  assert.equal(centsToUsdInput(5000), '50.00');
});
