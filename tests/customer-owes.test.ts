import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerOwesListLabel, partyCustomerOwes } from '../src/lib/customer-owes';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

test('partyCustomerOwes sums positive balances for the billed customer', () => {
  const r = partyCustomerOwes(
    [
      { customer_id: 'a', customer_balance: 10000, reservation_status: 'Booked' },
      { customer_id: 'a', customer_balance: 5000, reservation_status: 'Booked' },
      { customer_id: 'a', customer_balance: -2000, reservation_status: 'Booked' },
      { customer_id: 'b', customer_balance: 99999, reservation_status: 'Booked' },
      { customer_id: 'a', customer_balance: 8000, reservation_status: 'Cancelled' },
    ],
    'a',
  );
  assert.equal(r.owed_cents, 15000);
  assert.equal(r.incomplete, false);
  assert.equal(r.open_booking_count, 3);
  assert.equal(customerOwesListLabel(r, money), '$150.00');
});

test('unknown balance stays incomplete and never invents zero owed', () => {
  const allUnknown = partyCustomerOwes(
    [{ customer_id: 'a', customer_balance: null, reservation_status: 'Booked' }],
    'a',
  );
  assert.equal(allUnknown.owed_cents, null);
  assert.equal(allUnknown.incomplete, true);
  assert.equal(customerOwesListLabel(allUnknown, money), 'Incomplete');

  const mixed = partyCustomerOwes(
    [
      { customer_id: 'a', customer_balance: 4000, reservation_status: 'Booked' },
      { customer_id: 'a', customer_balance: null, reservation_status: 'Booked' },
    ],
    'a',
  );
  assert.equal(mixed.owed_cents, 4000);
  assert.equal(mixed.incomplete, true);
  assert.equal(customerOwesListLabel(mixed, money), '$40.00 · Incomplete');
});

test('no bookings → zero owed, not Incomplete', () => {
  const r = partyCustomerOwes([], 'a');
  assert.equal(r.owed_cents, 0);
  assert.equal(r.incomplete, false);
  assert.equal(r.open_booking_count, 0);
});
