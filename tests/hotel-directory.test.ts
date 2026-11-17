import test from 'node:test';
import assert from 'node:assert/strict';
import { hotelDirectorySearchClauses } from '../src/lib/hotel-directory';

test('hotel directory match=any does not require city AND name together', () => {
  const { conditions, values } = hotelDirectorySearchClauses(
    { location: 'test', q: 'Fontainebleau', match: 'any' },
    2,
  );
  assert.equal(conditions.length, 1);
  assert.match(conditions[0], /OR/);
  assert.deepEqual(values, ['%test%', '%Fontainebleau%']);
});

test('hotel directory default match keeps location and name as AND filters', () => {
  const { conditions, values } = hotelDirectorySearchClauses(
    { location: 'Miami', q: 'Fontainebleau', match: 'all' },
    2,
  );
  assert.equal(conditions.length, 2);
  assert.match(conditions[0], /location ILIKE \$2/);
  assert.match(conditions[1], /hotel_name ILIKE \$3/);
  assert.deepEqual(values, ['%Miami%', '%Fontainebleau%']);
});

test('hotel directory q alone also searches location text', () => {
  const { conditions, values } = hotelDirectorySearchClauses({ q: 'Miami Beach' }, 2);
  assert.equal(conditions.length, 1);
  assert.match(conditions[0], /h\.location ILIKE \$2/);
  assert.deepEqual(values, ['%Miami Beach%']);
});
