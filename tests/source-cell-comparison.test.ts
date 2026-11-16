import test from 'node:test';
import assert from 'node:assert/strict';
import { comparableSourceCells } from '../src/lib/source-cell-comparison';
test('newly captured formatting does not create a financial delta; zeros, formulas, notes and changed results do', () => {
  const previous = [
    {
      userEnteredValue: { formulaValue: '=A1*2' },
      effectiveValue: { numberValue: 0 },
      formattedValue: '$0.00',
    },
  ];
  const styled = [
    {
      ...previous[0],
      formattedValue: '0',
      userEnteredFormat: { backgroundColor: { red: 1 } },
      dataValidation: { strict: true },
    },
    {},
  ];
  assert.deepEqual(comparableSourceCells(previous), comparableSourceCells(styled));
  assert.notDeepEqual(
    comparableSourceCells(previous),
    comparableSourceCells([{ ...previous[0], effectiveValue: { numberValue: 10 } }]),
  );
  assert.notDeepEqual(
    comparableSourceCells(previous),
    comparableSourceCells([
      { ...previous[0], note: 'Keep the complete original note\nSecond line' },
    ]),
  );
  assert.deepEqual(comparableSourceCells([{ effectiveValue: { boolValue: false } }]), [
    { effectiveValue: { boolValue: false } },
  ]);
  assert.deepEqual(
    comparableSourceCells([{ formattedValue: 'Original legacy display-only source' }]),
    [{ displayOnly: 'Original legacy display-only source' }],
  );
});
