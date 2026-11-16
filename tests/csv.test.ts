import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell } from '../src/lib/csv';
test('financial CSV retains negative numeric amounts while neutralizing formula-like source text', () => {
  assert.equal(csvCell('-80.00'), '"-80.00"');
  assert.equal(csvCell('0.00'), '"0.00"');
  for (const value of [
    '=HYPERLINK("x")',
    '+12345',
    '-SUM(A1:A2)',
    '@command',
    '\t=command',
    '  =command',
  ])
    assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Original "note", line\nnext'), '"Original ""note"", line\nnext"');
});
