import assert from 'node:assert/strict';
import test from 'node:test';
import { incompleteProfitReason, supplierCostIncomplete } from '../src/lib/financial-display';
import { calendarEntries } from '../src/lib/travel-presentation';

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

test('calendar attention ignores missing customer sale when supplier cost is known', () => {
  const booking = {
    id: 'b1',
    code: 'QA-COST',
    customer: 'Test',
    travelers: 'Ada',
    summary: 'Flight',
    product: 'Flight',
    cost_incomplete: true,
    supplier_cost_incomplete: false,
    travel_start: '2026-11-20',
    travel_end: '2026-11-21',
  };
  const [entry] = calendarEntries([booking], [], 'All');
  assert.equal(entry.attention, false);
  const missingCost = calendarEntries(
    [{ ...booking, travelers: '', supplier_cost_incomplete: true }],
    [],
    'All',
  )[0];
  assert.equal(missingCost.attention, true);
});
