import assert from 'node:assert/strict';
import test from 'node:test';
import { countLabel, pluralize, pluralLabelFromPlural } from '../src/lib/count-label';
import { pluralLabel } from '../src/components/list-pager';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Plan wording: 1 booking / 1 credit — never hedge with (s)', () => {
  assert.equal(pluralize(1, 'booking'), 'booking');
  assert.equal(pluralize(2, 'booking'), 'bookings');
  assert.equal(countLabel(1, 'credit'), '1 credit');
  assert.equal(countLabel(3, 'credit'), '3 credits');
  assert.equal(countLabel(0, 'traveler'), '0 travelers');
  assert.equal(pluralLabelFromPlural(1, 'bookings'), 'booking');
  assert.equal(pluralLabelFromPlural(2, 'bookings'), 'bookings');
  assert.equal(pluralLabelFromPlural(1, 'activity rows'), 'activity rows');
  assert.equal(pluralLabel(1, 'payments'), 'payment');
});

test('workspace and command-form use countLabel — no credit(s) / traveler(s)', () => {
  const workspace = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  const form = readFileSync(join(process.cwd(), 'src/components/command-form.tsx'), 'utf8');
  const units = readFileSync(join(process.cwd(), 'src/lib/asset-units.ts'), 'utf8');
  assert.match(workspace, /countLabel\(/);
  assert.doesNotMatch(workspace, /credit\(s\)/);
  assert.match(form, /countLabel\(/);
  assert.doesNotMatch(form, /traveler\(s\)/);
  assert.match(units, /pluralize\(amount, 'certificate'\)/);
  assert.doesNotMatch(units, /certificate\(s\)/);
});
