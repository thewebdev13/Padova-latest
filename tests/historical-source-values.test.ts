import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalSourceValue } from '../src/lib/historical-source-values';

test('preserved historical fields display readable names, dates and money without inventing zeroes', () => {
  assert.equal(historicalSourceValue({ formattedValue: 'Jul 21\nAug 13' }), 'Jul 21\nAug 13');
  assert.equal(historicalSourceValue({ effectiveValue: { numberValue: 5341.6 } }), '5341.6');
  assert.equal(historicalSourceValue({ effectiveValue: { numberValue: 0 } }), '0');
  assert.equal(historicalSourceValue({ userEnteredValue: { formulaValue: '=C1*D1' } }), '');
  assert.equal(historicalSourceValue({}), '');
  assert.equal(historicalSourceValue(null), '');
});
