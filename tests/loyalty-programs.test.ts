import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOYALTY_PROGRAM_OTHER,
  LOYALTY_PROGRAMS,
  mergeLoyaltyProgramOptions,
  resolveLoyaltyProgram,
} from '../src/lib/entry-options';

test('Plan loyalty programs merge owner-added names + Other…', () => {
  const opts = mergeLoyaltyProgramOptions([
    'United MileagePlus',
    'Alaska Mileage Plan',
    '',
    '  JetBlue TrueBlue  ',
  ]);
  assert.ok(opts.includes('United MileagePlus'));
  assert.ok(opts.includes('Alaska Mileage Plan'));
  assert.ok(opts.includes('JetBlue TrueBlue'));
  assert.equal(opts.filter((o) => o === 'United MileagePlus').length, 1);
  assert.equal(opts[opts.length - 1], LOYALTY_PROGRAM_OTHER);
  assert.ok(LOYALTY_PROGRAMS.includes('Marriott Bonvoy' as (typeof LOYALTY_PROGRAMS)[number]));
});

test('resolveLoyaltyProgram requires custom name for Other…', () => {
  assert.equal(resolveLoyaltyProgram('Delta SkyMiles'), 'Delta SkyMiles');
  assert.equal(resolveLoyaltyProgram(LOYALTY_PROGRAM_OTHER, 'Bilt Rewards'), 'Bilt Rewards');
  assert.equal(resolveLoyaltyProgram(LOYALTY_PROGRAM_OTHER, '  '), '');
  assert.equal(resolveLoyaltyProgram('Other', 'Flying Blue'), 'Flying Blue');
});
