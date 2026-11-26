import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSellerUnpaidAttention,
  isSellerUnpaidAttention,
  sellerNamesLabel,
  sellerUnpaidEntryHint,
  sellerUnpaidOperationalStatus,
  SELLER_UNPAID_KIND,
  SELLER_UNPAID_STATUS,
} from '../src/lib/seller-unpaid';
import { buildDashboardTodoList } from '../src/lib/dashboard-todo';

test('Pay seller ASAP attention keeps stable supplier key and names sellers', () => {
  const row = buildSellerUnpaidAttention({
    bookingId: 'b1',
    code: 'PDV-100',
    amountCents: 85000,
    sellerNames: ['Amex BP Seller', 'Amex BP Seller', ''],
  });
  assert.equal(row.key, 'supplier:b1');
  assert.equal(row.fingerprint, '85000');
  assert.equal(row.kind, SELLER_UNPAID_KIND);
  assert.match(row.title, /Pay seller ASAP/);
  assert.match(row.detail, /Amex BP Seller/);
  assert.match(row.detail, /paid right away/);
  assert.equal(sellerNamesLabel([]), 'Seller');
});

test('entry hint only when unpaid / partial; Paid stays silent', () => {
  assert.match(String(sellerUnpaidEntryHint('Unpaid')), /to-do list/);
  assert.match(String(sellerUnpaidEntryHint('Partial')), /to-do list/);
  assert.equal(sellerUnpaidEntryHint('Paid'), null);
  assert.equal(sellerUnpaidEntryHint(''), null);
  assert.equal(sellerUnpaidOperationalStatus(false), SELLER_UNPAID_STATUS);
  assert.match(sellerUnpaidOperationalStatus(true), /incomplete/);
});

test('dashboard to-do surfaces Pay seller ASAP ahead of quieter attention', () => {
  const rows = buildDashboardTodoList({
    tasks: [{ id: 't1', title: 'Call customer', status: 'Open' }],
    attention: [
      { key: 'a1', title: 'PDV-1 · Missing cost', booking_id: 'b1' },
      {
        key: 'supplier:b2',
        title: 'PDV-2 · Pay seller ASAP',
        kind: SELLER_UNPAID_KIND,
        booking_id: 'b2',
      },
    ],
    limit: 10,
  });
  assert.equal(rows[0].kind, 'task');
  assert.equal(rows[1].title, 'PDV-2 · Pay seller ASAP');
  assert.ok(isSellerUnpaidAttention({ key: 'supplier:b2', title: 'PDV-2 · Pay seller ASAP' }));
  assert.equal(isSellerUnpaidAttention({ key: 'a1', title: 'Missing cost' }), false);
});
