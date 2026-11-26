import assert from 'node:assert/strict';
import test from 'node:test';
import { searchableDropdownOpensFor } from '../src/lib/searchable-dropdown-policy';

test('Plan Do-now: searchable dropdowns do not open on tab-focus alone', () => {
  assert.equal(searchableDropdownOpensFor('focus'), false);
  assert.equal(searchableDropdownOpensFor('click'), true);
  assert.equal(searchableDropdownOpensFor('change'), true);
  assert.equal(searchableDropdownOpensFor('arrow'), true);
});
