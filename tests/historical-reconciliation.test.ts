import test from 'node:test';
import assert from 'node:assert/strict';
import { exactCents, roster, sourceDelta } from '../scripts/lib/historical-reconciliation';

test('historical money preserves exact cents, unknowns and original subcent ambiguity', () => {
  assert.equal(exactCents('$3,322.50'), 332250);
  assert.equal(exactCents('-1,003.97'), -100397);
  assert.equal(exactCents(0), 0);
  assert.equal(exactCents(null), null);
  assert.equal(exactCents(''), null);
  assert.equal(exactCents('3,32.50'), null);
  assert.equal(exactCents(3089.925), null);
  assert.equal(exactCents(774.4157), null);
  assert.equal(exactCents(1.77), 177);
  assert.equal(exactCents(9007199254740991), null);
});
test('fresh delta ignores presentation but preserves changes to formulas and notes', () => {
  const row = {
    workbook_id: 'original',
    tab: 'accounting',
    row: 790,
    raw_payload: {
      values: [
        {
          userEnteredValue: { numberValue: 12 },
          effectiveValue: { numberValue: 12 },
          formattedValue: '12.00',
        },
      ],
    },
  };
  const formatted = structuredClone(row);
  formatted.raw_payload.values[0].formattedValue = '$12.00';
  assert.equal(sourceDelta([row], [formatted]).changed.length, 0);
  const note: any = structuredClone(row);
  note.raw_payload.values[0].note = 'Owner correction';
  assert.equal(sourceDelta([row], [note]).changed.length, 1);
  assert.throws(() => sourceDelta([row, row], [row]), /Duplicate/);
  assert.equal(sourceDelta([row], []).missing.length, 1);
});
test('roster notation yields labels without manufacturing identity matches', () => {
  assert.deepEqual(roster('GOLDSTEIN, Sarah / Leah').names, ['Sarah GOLDSTEIN', 'Leah GOLDSTEIN']);
  assert.deepEqual(roster('COHEN/CHANA').names, ['CHANA COHEN']);
  assert.deepEqual(roster('Sam-Lee Cohen').names, ['Sam-Lee Cohen']);
  assert.equal(roster('JFK-LAX').names.length, 0);
  assert.equal(roster('Pax').classification, 'Header');
  assert.deepEqual(roster('Unresolved').unresolved, ['Unresolved']);
  assert.deepEqual(roster('Jane Cohen (child)').names, ['Jane Cohen']);
});
