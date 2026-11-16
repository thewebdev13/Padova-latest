import assert from 'node:assert/strict';
import test from 'node:test';
import { populated, populatedPaths, classifySourceField } from '../src/lib/source-field-coverage';
test('source preservation distinguishes blanks from zero/false and retains formulas and exact notes', () => {
  assert.equal(populated(''), false);
  assert.equal(populated(null), false);
  assert.equal(populated(0), true);
  assert.equal(populated(false), true);
  const original = {
    values: [
      {
        userEnteredValue: { formulaValue: '=SUM(A1:A3)' },
        effectiveValue: { numberValue: 0 },
        note: 'Original\nunsummarized note',
      },
    ],
  };
  assert.deepEqual([...populatedPaths(original)].sort(), [
    'values[].effectiveValue.numberValue',
    'values[].note',
    'values[].userEnteredValue.formulaValue',
  ]);
  assert.equal(original.values[0].note, 'Original\nunsummarized note');
});
test('unmapped and unverified financial fields are preserved rather than discarded or posted', () => {
  assert.equal(classifySourceField('New Rate').category, 'B');
  assert.equal(classifySourceField('Paid').category, 'D');
  for (const field of ['', 'Worker unusual note', 'Unknown new acquisition type']) {
    const plan = classifySourceField(field);
    assert.equal(plan.category, 'C');
    assert.equal(plan.status, 'preserved raw');
  }
});
