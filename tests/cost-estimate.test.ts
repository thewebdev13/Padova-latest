import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCostEstimateAttention,
  componentIsCostEstimate,
  costEstimateEntryHint,
  formatOtherCurrencyLabel,
  listCostEstimateComponents,
  normalizeOtherCurrencyNote,
  COST_ESTIMATE_KIND,
} from '../src/lib/cost-estimate';

test('other currency note normalizes code; blank code stays absent', () => {
  assert.deepEqual(normalizeOtherCurrencyNote({ code: ' eur ', amount: '420.50', rate: '1.08' }), {
    code: 'EUR',
    amount: '420.50',
    rate: '1.08',
  });
  assert.equal(normalizeOtherCurrencyNote({ code: '  ' }), undefined);
  assert.equal(formatOtherCurrencyLabel({ code: 'EUR', amount: '100' }), 'EUR · 100');
});

test('estimate flag or foreign-only line is a cost estimate; confirmed USD alone is not', () => {
  assert.equal(componentIsCostEstimate({ cost_is_estimate: true, cost: 50000 }), true);
  assert.equal(componentIsCostEstimate({ other_currency: { code: 'EUR' }, cost: null }), true);
  assert.equal(componentIsCostEstimate({ cost: 50000 }), false);
  assert.equal(
    listCostEstimateComponents([
      { cost: 100 },
      { cost_is_estimate: true },
      { other_currency: { code: 'GBP' } },
    ]).length,
    2,
  );
});

test('attention Cost estimate never invents USD from foreign amount', () => {
  const row = buildCostEstimateAttention({
    bookingId: 'b1',
    code: 'PDV-9',
    components: [
      {
        cost_is_estimate: true,
        other_currency: { code: 'EUR', amount: '350' },
      },
    ],
  });
  assert.ok(row);
  assert.equal(row!.key, 'cost-estimate:b1');
  assert.equal(row!.kind, COST_ESTIMATE_KIND);
  assert.match(row!.title, /Cost estimate/);
  assert.match(row!.detail, /never changes profit/i);
  assert.match(row!.detail, /EUR/);
  assert.equal(buildCostEstimateAttention({ bookingId: 'b', code: 'X', components: [] }), null);
  assert.match(costEstimateEntryHint(), /never invents USD/);
});
