import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingSourceMethodMatch, exactEligibleMatch } from '../src/lib/quick-paste';

test('Capital One Travel paste matches unique Capital One channel', () => {
  const rows = [
    { id: '1', name: 'GDS', products: ['Flight'] },
    { id: '2', name: 'Capital One', products: ['Flight', 'Hotel'] },
  ];
  assert.equal(exactEligibleMatch(rows, 'Capital One Travel'), undefined);
  assert.equal(bookingSourceMethodMatch(rows, 'Capital One Travel')?.id, '2');
  assert.equal(bookingSourceMethodMatch(rows, 'Capital One')?.id, '2');
});

test('ambiguous Capital One channels stay unmatched', () => {
  const rows = [
    { id: 'a', name: 'Capital One Travel', products: ['Flight'] },
    { id: 'b', name: 'Capital One Business', products: ['Flight'] },
  ];
  assert.equal(bookingSourceMethodMatch(rows, 'Capital One'), undefined);
});
