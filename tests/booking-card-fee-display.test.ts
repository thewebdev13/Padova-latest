import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingCardFeeSpread,
  isCustomerCardFeeKind,
  sumCustomerCardFeeCharges,
} from '../src/lib/booking-card-fee-display';

test('sums Card fee charges; ignores other kinds', () => {
  assert.equal(
    sumCustomerCardFeeCharges([
      { kind: 'Sale', amount: 10000 },
      { kind: 'Card fee', amount: 290 },
      { kind: 'Card charge', amount: 10 },
    ]),
    300,
  );
  assert.equal(sumCustomerCardFeeCharges([{ kind: 'Sale', amount: 10000 }]), 0);
  assert.equal(isCustomerCardFeeKind('processor fee'), true);
});

test('spread = customer charged − Padova cost when both known', () => {
  const s = bookingCardFeeSpread({
    customer_charged_cents: 290,
    padova_cost_cents: 257,
  });
  assert.equal(s.spread_cents, 33);
  assert.equal(s.incomplete, false);
  assert.equal(s.has_any, true);
});

test('missing Padova cost with customer fee → Incomplete ≠ invent $0', () => {
  const s = bookingCardFeeSpread({
    customer_charged_cents: 290,
    padova_cost_cents: null,
  });
  assert.equal(s.spread_cents, null);
  assert.equal(s.incomplete, true);
  assert.equal(s.has_any, true);
});

test('no card fees → zero totals, not Incomplete noise', () => {
  const s = bookingCardFeeSpread({
    customer_charged_cents: 0,
    padova_cost_cents: 0,
  });
  assert.equal(s.has_any, false);
  assert.equal(s.spread_cents, 0);
  assert.equal(s.incomplete, false);
});
