import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';
import {
  SUPPLIER_REFUND_DENIED_FORM,
  supplierRefundStatus,
  supplierRefundStatusLabel,
} from '../src/lib/supplier-refund-status';

test('supplier refund status labels: expected / received / denied', () => {
  assert.equal(
    supplierRefundStatus({ supplier_expected: 10000, received: 0, received_forms: '' }),
    'expected',
  );
  assert.equal(
    supplierRefundStatus({
      supplier_expected: 10000,
      received: 10000,
      received_forms: 'cash',
    }),
    'received',
  );
  assert.equal(
    supplierRefundStatus({
      supplier_expected: 10000,
      received: 10000,
      received_forms: 'denied',
    }),
    'denied',
  );
  assert.equal(
    supplierRefundStatus({
      supplier_expected: 10000,
      received: 4000,
      received_forms: 'cash',
    }),
    'partial',
  );
  assert.equal(supplierRefundStatusLabel('denied'), 'Denied');
});

let db: Database;
let owner: Actor;
const ownerPassword = 'Synthetic owner password for supplier refund deny tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Supplier Deny Owner',
    email: 'supplier-deny-owner@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

async function cmd(kind: string, data: Record<string, unknown>) {
  return execute(db, owner, { id: randomUUID(), kind: kind as any, data });
}

test('receive_refund form denied closes expected with $0 recovery', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Deny Refund Customer',
    roles: ['customer', 'traveler'],
  });
  const supplier = await cmd('party', {
    kind: 'supplier',
    name: 'Deny Refund Hotel',
    roles: ['seller'],
  });
  const account = await cmd('payment_account', {
    name: 'Deny Refund Bank',
    kind: 'Bank',
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Supplier deny case',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 20000,
  });
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 15000,
    cost: 15000,
    date,
  });
  await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 20000,
    date,
    method: 'ACH',
    account_id: account.id,
    allocations: [{ booking_id: booking.id, amount: 20000 }],
  });
  const refund = await cmd('cancel', {
    booking_id: booking.id,
    supplier_expected: 15000,
    customer_due: 20000,
    charge_reduction: 20000,
    due_on: date,
    date,
    reason: 'Non-refundable — supplier denied',
  });
  await assert.rejects(
    () =>
      cmd('receive_refund', {
        refund_id: refund.id,
        amount: 15000,
        form: SUPPLIER_REFUND_DENIED_FORM,
        date,
      }),
    /reference|reason/i,
  );
  const denied = await cmd('receive_refund', {
    refund_id: refund.id,
    amount: 15000,
    form: SUPPLIER_REFUND_DENIED_FORM,
    date,
    reference: 'Airline: non-refundable fare',
  });
  assert.equal(denied.form, SUPPLIER_REFUND_DENIED_FORM);
  assert.equal(Number(denied.recognized_basis ?? 0), 0);
  const settled = (
    await db.query(
      `SELECT COALESCE(sum(amount),0) amount FROM refund_movements WHERE refund_id=$1 AND kind='supplier_received'`,
      [refund.id],
    )
  ).rows[0];
  assert.equal(Number(settled.amount), 15000);
  // Customer can be paid without cash override once supplier expected is closed by deny.
  const paid = await cmd('pay_refund', {
    refund_id: refund.id,
    amount: 20000,
    date,
    how_given: 'original_method',
    method: 'ACH',
    account_id: account.id,
  });
  assert.equal(paid.kind, 'customer_paid');
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.customer_balance), 0);
});
