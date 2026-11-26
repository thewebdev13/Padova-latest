import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocationLinesForPayment,
  cardFeeCentsByPaymentId,
  customerPaymentsForParty,
} from '../src/lib/customer-payments';
import { PAYMENT_METHODS } from '../src/lib/entry-options';

test('customerPaymentsForParty lists receipts with allocation status', () => {
  const s = customerPaymentsForParty(
    [
      {
        id: 'p1',
        party_id: 'c1',
        direction: 'customer',
        paid_on: '2026-11-20',
        method: 'Zelle',
        reference: 'ABC',
        current_amount: 10000,
        allocated: 10000,
        commission_allocated: 0,
      },
      {
        id: 'p2',
        party_id: 'c1',
        direction: 'customer',
        paid_on: '2026-11-21',
        method: 'Card',
        reference: '',
        current_amount: 5000,
        allocated: 2000,
        commission_allocated: 0,
      },
      {
        id: 'p3',
        party_id: 'other',
        direction: 'customer',
        current_amount: 99999,
        allocated: 0,
      },
      {
        id: 'p4',
        party_id: 'c1',
        direction: 'supplier',
        current_amount: 1000,
        allocated: 0,
      },
    ],
    'c1',
  );
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[0].id, 'p2'); // newest first
  assert.equal(s.rows[0].status, 'open');
  assert.equal(s.rows[0].unallocated_cents, 3000);
  assert.equal(s.rows[1].status, 'cleared');
  assert.equal(s.received_cents, 15000);
  assert.equal(s.allocated_cents, 12000);
  assert.equal(s.unallocated_cents, 3000);
  assert.equal(s.open_count, 1);
  assert.equal(s.incomplete, false);
});

test('unknown payment amounts stay incomplete — never invent $0 received', () => {
  const s = customerPaymentsForParty(
    [
      {
        id: 'p1',
        party_id: 'c1',
        direction: 'customer',
        current_amount: null,
        allocated: null,
      },
    ],
    'c1',
  );
  assert.equal(s.rows.length, 1);
  assert.equal(s.received_cents, null);
  assert.equal(s.incomplete, true);
});

test('no payments → zero totals, not Incomplete', () => {
  const s = customerPaymentsForParty([], 'c1');
  assert.equal(s.rows.length, 0);
  assert.equal(s.received_cents, 0);
  assert.equal(s.incomplete, false);
});

test('one receipt shows booking allocation lines; skips reversed net 0', () => {
  const lines = allocationLinesForPayment(
    [
      {
        id: 'a1',
        payment_id: 'p1',
        booking_id: 'b1',
        booking_code: 'PD-1',
        booking_product: 'Flight',
        net_amount: 4000,
      },
      {
        id: 'a2',
        payment_id: 'p1',
        booking_id: 'b2',
        booking_code: 'PD-2',
        booking_product: 'Hotel',
        net_amount: 3000,
      },
      {
        id: 'a3',
        payment_id: 'p1',
        booking_id: 'b3',
        booking_code: 'PD-3',
        net_amount: 0,
      },
      {
        id: 'a4',
        payment_id: 'other',
        booking_id: 'b9',
        booking_code: 'X',
        net_amount: 999,
      },
    ],
    'p1',
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].booking_label, 'PD-1 · Flight');
  assert.equal(lines[1].amount_cents, 3000);

  const s = customerPaymentsForParty(
    [
      {
        id: 'p1',
        party_id: 'c1',
        direction: 'customer',
        paid_on: '2026-11-20',
        method: 'Zelle',
        reference: 'lump',
        current_amount: 10000,
        allocated: 7000,
        commission_allocated: 0,
      },
    ],
    'c1',
    [
      {
        id: 'a1',
        payment_id: 'p1',
        booking_id: 'b1',
        booking_code: 'PD-1',
        booking_product: 'Flight',
        net_amount: 4000,
      },
      {
        id: 'a2',
        payment_id: 'p1',
        booking_id: 'b2',
        booking_code: 'PD-2',
        booking_product: 'Hotel',
        net_amount: 3000,
      },
    ],
  );
  assert.equal(s.rows[0].lines.length, 2);
  assert.equal(s.rows[0].unallocated_cents, 3000);
  assert.equal(s.rows[0].status, 'open');
});

test('unknown allocation amount stays Incomplete — never invent $0 line', () => {
  const s = customerPaymentsForParty(
    [
      {
        id: 'p1',
        party_id: 'c1',
        direction: 'customer',
        current_amount: 5000,
        allocated: 5000,
        commission_allocated: 0,
      },
    ],
    'c1',
    [
      {
        id: 'a1',
        payment_id: 'p1',
        booking_id: 'b1',
        booking_code: 'PD-1',
        net_amount: null,
      },
    ],
  );
  assert.equal(s.rows[0].lines[0].amount_cents, null);
  assert.equal(s.incomplete, true);
});

test('card fee is a separate line on the receipt; PayPal is a Plan method', () => {
  assert.ok(PAYMENT_METHODS.includes('PayPal'));
  assert.ok(PAYMENT_METHODS.includes('Wire'));
  assert.ok(PAYMENT_METHODS.includes('Cash'));

  const fees = cardFeeCentsByPaymentId([
    { payment_id: 'p1', customer_card_fee_cents: 290 },
    { payment_id: 'p2', customer_card_fee_cents: null },
  ]);
  assert.equal(fees.get('p1'), 290);
  assert.equal(fees.get('p2'), null);

  const s = customerPaymentsForParty(
    [
      {
        id: 'p1',
        party_id: 'c1',
        direction: 'customer',
        method: 'Card',
        current_amount: 10290,
        allocated: 10290,
        commission_allocated: 0,
      },
    ],
    'c1',
    [],
    fees,
  );
  assert.equal(s.rows[0].card_fee_cents, 290);
});
