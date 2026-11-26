import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsBatchListLabel, pointsBatchSummary } from '../src/lib/points-batch';

const qty = (n: number) => n.toLocaleString('en-US');

test('pointsBatchSummary: 100k bought, 40k used → 60k left at 1.3¢', () => {
  // $1,300 remaining basis on 60k = floor 2 ¢/pt? 130000/60000 = 2
  // Plan example: 100k @ 1.3¢ = $1300; 40k used → $520; 60k + $780 remain → 78000/60000 = 1 ¢/pt floor
  const s = pointsBatchSummary({
    opening: 100000,
    remaining: 60000,
    remaining_basis_cents: 78000,
  });
  assert.equal(s.used, 40000);
  assert.equal(s.remaining, 60000);
  assert.equal(s.cents_per_point, 1);
  assert.equal(s.incomplete, false);
  assert.match(pointsBatchListLabel(s, qty), /40,000 used/);
  assert.match(pointsBatchListLabel(s, qty), /60,000 left/);
  assert.match(pointsBatchListLabel(s, qty), /1 ¢\/pt/);
});

test('unknown opening → used Incomplete; never invents', () => {
  const s = pointsBatchSummary({
    opening: null,
    remaining: 50000,
    remaining_basis_cents: 65000,
  });
  assert.equal(s.used, null);
  assert.equal(s.remaining, 50000);
  assert.equal(s.cents_per_point, 1);
  assert.equal(s.incomplete, true);
  assert.match(pointsBatchListLabel(s, qty), /Used Incomplete/);
});

test('unknown remaining basis → ¢/pt Incomplete', () => {
  const s = pointsBatchSummary({
    opening: 100000,
    remaining: 100000,
    remaining_basis_cents: null,
  });
  assert.equal(s.used, 0);
  assert.equal(s.cents_per_point, null);
  assert.equal(s.incomplete, true);
});
