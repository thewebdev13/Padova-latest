import assert from 'node:assert/strict';
import test from 'node:test';
import { howBookedHint } from '../src/lib/how-booked';
import {
  OUTSIDE_SELLER_COST_HINT,
  outsideSellerAllowsRebateExpected,
  stripOutsideSellerRebateExpected,
} from '../src/lib/outside-seller';

test('Outside seller Plan copy: agreed cost only; rebate not Padova income', () => {
  assert.match(OUTSIDE_SELLER_COST_HINT, /agreed price only/i);
  assert.match(OUTSIDE_SELLER_COST_HINT, /not Padova income/i);
  assert.match(howBookedHint('Outside seller'), /information only/i);
  assert.match(howBookedHint('Outside seller'), /not Padova income/i);
});

test('Outside seller never keeps rebate_expected; Owned value may', () => {
  assert.equal(outsideSellerAllowsRebateExpected('Outside seller'), false);
  assert.equal(outsideSellerAllowsRebateExpected('Owned value'), true);
  assert.deepEqual(
    stripOutsideSellerRebateExpected({
      type: 'Outside seller',
      cost: 85000,
      rebate_expected: 35000,
    }),
    { type: 'Outside seller', cost: 85000 },
  );
  assert.deepEqual(
    stripOutsideSellerRebateExpected({
      type: 'Owned value',
      rebate_expected: 1000,
    }),
    { type: 'Owned value', rebate_expected: 1000 },
  );
});
