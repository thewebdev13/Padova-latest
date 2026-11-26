import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsOwningAccountLabel } from '../src/lib/points-owning-account';

test('points owning account label never invents a blank account', () => {
  assert.equal(pointsOwningAccountLabel(null), null);
  assert.equal(pointsOwningAccountLabel({ id: 'a', name: '  ' }), null);
  assert.equal(
    pointsOwningAccountLabel({
      id: 'a',
      name: 'Padova UA main',
      program_name: 'United MileagePlus',
      masked_reference: '4821',
    }),
    'Padova UA main · United MileagePlus · ····4821',
  );
  assert.equal(
    pointsOwningAccountLabel({ id: 'b', name: 'Chase UR' }),
    'Chase UR',
  );
});
