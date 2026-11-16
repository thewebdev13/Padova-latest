import assert from 'node:assert/strict';
import test from 'node:test';
import { incompleteProfitReason, supplierCostIncomplete } from '../src/lib/financial-display';

test('known supplier cost remains visible when the customer selling price is missing', () => {
  const booking = {
    supplier_cost_incomplete: false,
    cost_incomplete: true,
    itinerary: { sale_known: false },
  };
  assert.equal(supplierCostIncomplete(booking), false);
  assert.equal(incompleteProfitReason(booking), 'Customer price needed');
});

test('an incomplete supplier cost is never presented as known merely because a sale exists', () => {
  const booking = {
    supplier_cost_incomplete: true,
    cost_incomplete: true,
    itinerary: { sale_known: true },
  };
  assert.equal(supplierCostIncomplete(booking), true);
  assert.equal(incompleteProfitReason(booking), 'Cost incomplete');
  assert.equal(supplierCostIncomplete({}), true);
});

test('complete financial state has no missing-price or missing-cost warning', () => {
  const booking = {
    supplier_cost_incomplete: false,
    cost_incomplete: false,
    itinerary: { sale_known: true },
  };
  assert.equal(supplierCostIncomplete(booking), false);
  assert.equal(incompleteProfitReason(booking), null);
});
