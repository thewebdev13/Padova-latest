import assert from 'node:assert/strict';
import test from 'node:test';
import { transactionList, transactionIndicators } from '../src/lib/transaction-list';

test('business dates order bookings and distinct sales without treating import dates as booking dates', () => {
  const bookings = [
    { id: 'unknown', booked_on: null, created_at: '2026-11-05' },
    { id: 'flight', booked_on: '2026-09-01', created_at: '2026-11-05' },
  ];
  const sales = [
    { id: 'sale-one', asset_id: 'voucher', effective_on: '2026-10-01', payment_id: 'receipt' },
    { id: 'sale-two', asset_id: 'voucher', effective_on: '2026-09-02', payment_id: null },
  ];
  assert.deepEqual(
    transactionList(bookings, sales).map((row) => row.record.id),
    ['sale-one', 'sale-two', 'flight', 'unknown'],
  );
  assert.equal(bookings[0].id, 'unknown');
});

test('transaction signals distinguish unknown, partial, paid and outstanding seller balances', () => {
  const permissions = { sale: true, cost: true };
  const labels = (record: Record<string, any>) =>
    transactionIndicators('booking', record, {}, permissions).map((f) => f.label);
  assert.deepEqual(labels({ customer_balance: null }), ['Payment needs review']);
  assert.deepEqual(labels({ customer_balance: 100, recorded_supplier_balance: 200 }), [
    'Balance open',
    'Seller unpaid',
  ]);
  assert.deepEqual(labels({ customer_balance: 0 }), ['Customer paid']);
  assert.deepEqual(labels({ customer_balance: -100 }), ['Customer credit']);
  assert.equal(
    transactionIndicators('sale', { proceeds: 1000, received: 400 }, {}, permissions)[0].label,
    'Customer owes',
  );
  assert.equal(
    transactionIndicators('sale', { proceeds: 1000 }, {}, permissions)[0].label,
    'Payment needs review',
  );
  assert.equal(
    transactionIndicators('sale', { proceeds: 1000, received: 1000 }, {}, permissions)[0].label,
    'Customer paid',
  );
});

test('follow-up signals reuse only matching authorized views without disclosing hidden money', () => {
  const views = {
    'Pending Refunds': [{ booking_id: 'b' }],
    'Commission Payable': [{ booking_id: 'other' }],
  };
  assert.deepEqual(
    transactionIndicators(
      'booking',
      { id: 'b', customer_balance: 999, recorded_supplier_balance: 999 },
      views,
      { sale: false, cost: false },
    ),
    [{ label: 'Refund pending', tone: 'amber' }],
  );
});

test('booking and sale IDs remain distinct and an unavailable sales population is not invented', () => {
  const booking = { id: 'same', booked_on: '2026-10-01' };
  assert.deepEqual(
    transactionList([booking], [{ id: 'same', effective_on: '2026-10-01' }]).map((row) => row.kind),
    ['booking', 'sale'],
  );
  assert.equal(transactionList([booking], []).length, 1);
});
