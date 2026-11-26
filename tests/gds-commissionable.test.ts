import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GDS_COMMISSIONABLE_NOTES_50_50,
  GDS_COMMISSIONABLE_OPTIONS,
  gdsCommissionableHint,
  gdsCommissionExpectedSeed,
  grossRetainedFromNet5050,
  notesIndicateSruly5050,
} from '../src/lib/gds-commissionable';
import { buildConfirmCommissionDefaults } from '../src/lib/confirm-commission';
import { operationalEntry } from '../src/lib/booking-entry';

test('GDS commissionable options are Yes / No / Unknown', () => {
  assert.deepEqual([...GDS_COMMISSIONABLE_OPTIONS], ['Yes', 'No', 'Unknown']);
});

test('seed expected Money Back from commissionable answer — never invent amount', () => {
  assert.deepEqual(gdsCommissionExpectedSeed('Yes'), {
    expected: 'Yes',
    notes: GDS_COMMISSIONABLE_NOTES_50_50,
  });
  assert.deepEqual(gdsCommissionExpectedSeed('No'), { expected: 'No' });
  assert.deepEqual(gdsCommissionExpectedSeed('Unknown'), { expected: 'Unknown' });
  assert.equal(gdsCommissionExpectedSeed(''), undefined);
  assert.match(gdsCommissionableHint('Yes'), /Unknown until Confirm/i);
  assert.match(gdsCommissionableHint('No'), /\$50/i);
});

test('50/50 net → gross/retained; Confirm seeds from GDS notes', () => {
  assert.ok(notesIndicateSruly5050(GDS_COMMISSIONABLE_NOTES_50_50));
  assert.deepEqual(grossRetainedFromNet5050(5000), { gross: 10000, retained: 5000 });
  const seeded = buildConfirmCommissionDefaults({
    bookingId: 'b1',
    which: 'primary',
    commission: {
      expected: 'Yes',
      amount: 5000,
      due_on: '2026-11-30',
      notes: GDS_COMMISSIONABLE_NOTES_50_50,
    },
  });
  assert.equal(seeded.gross, 10000);
  assert.equal(seeded.retained, 5000);
  assert.equal(seeded.due_on, '2026-11-30');
});

test('operationalEntry accepts gds_commissionable on Cash / GDS', () => {
  const parsed = operationalEntry.parse({
    version: 1,
    how_booked: 'Cash / GDS',
    gds_commissionable: 'Yes',
    references: [],
    new_travelers: [],
    notes: '',
    sale_known: true,
    components: [],
    additional_charge: 0,
  });
  assert.equal(parsed.gds_commissionable, 'Yes');
});
