import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  TRAVELER_PERSONAL_OPTIONAL_KEYS,
  travelerPersonalOptionalShouldOpen,
} from '../src/lib/traveler-personal-fields';

test('traveler personal optional opens only when a rare field is filled', () => {
  assert.equal(travelerPersonalOptionalShouldOpen({}), false);
  assert.equal(travelerPersonalOptionalShouldOpen({ legal_first: 'Ada' }), false);
  assert.equal(travelerPersonalOptionalShouldOpen({ dob: '1990-01-01' }), true);
  assert.equal(travelerPersonalOptionalShouldOpen({ passport_number: 'X' }), true);
  assert.equal(travelerPersonalOptionalShouldOpen({ loyalty_number: 'FF123' }), true);
  assert.ok(TRAVELER_PERSONAL_OPTIONAL_KEYS.includes('passport_number'));
  assert.ok(TRAVELER_PERSONAL_OPTIONAL_KEYS.includes('dob'));
  assert.ok(!TRAVELER_PERSONAL_OPTIONAL_KEYS.includes('legal_first' as never));
});

test('command-form collapses traveler personal data behind optional details', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/command-form.tsx'), 'utf8');
  assert.match(src, /TRAVELER_PERSONAL_OPTIONAL_KEYS/);
  assert.match(src, /travelerPersonalOptionalShouldOpen/);
  assert.match(src, /Personal travel details · passport, DOB, loyalty/);
  assert.match(src, /Saved memberships & travel documents \(optional\)/);
  assert.match(src, /kind === 'traveler'[\s\S]*TRAVELER_PERSONAL_OPTIONAL_KEYS/);
});
