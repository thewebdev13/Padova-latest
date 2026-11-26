import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';
import {
  defaultRefundVoucherName,
  isCashOutHowGiven,
  REFUND_HOW_GIVEN,
  refundHowGivenLabel,
} from '../src/lib/refund-how-given';

test('Plan how-given labels and cash-out helpers', () => {
  assert.deepEqual([...REFUND_HOW_GIVEN], [
    'original_method',
    'customer_credit',
    'voucher',
    'other',
  ]);
  assert.equal(refundHowGivenLabel('voucher'), 'Voucher');
  assert.equal(refundHowGivenLabel('other'), 'Other');
  assert.equal(isCashOutHowGiven('original_method'), true);
  assert.equal(isCashOutHowGiven('other'), true);
  assert.equal(isCashOutHowGiven('voucher'), false);
  assert.equal(isCashOutHowGiven('customer_credit'), false);
  assert.equal(defaultRefundVoucherName('PDV-1'), 'Refund voucher — PDV-1');
});

let db: Database;
let owner: Actor;
const ownerPassword = 'Synthetic owner password for refund how-given tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Refund How Owner',
    email: 'refund-how-owner@example.invalid',
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

async function seedRefundCase() {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Refund How Customer',
    roles: ['customer', 'traveler'],
  });
  const supplier = await cmd('party', {
    kind: 'supplier',
    name: 'Refund How Hotel',
    roles: ['seller'],
  });
  const account = await cmd('payment_account', {
    name: 'Refund How Bank',
    kind: 'Bank',
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Refund how-given case',
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
    reason: 'Cancelled for how-given test',
  });
  await cmd('receive_refund', {
    refund_id: refund.id,
    amount: 15000,
    form: 'cash',
    date,
    method: 'ACH',
    account_id: account.id,
  });
  return { customer, account, booking, refund };
}

test('pay_refund how_given voucher creates customer-owned voucher', async () => {
  const { booking, refund } = await seedRefundCase();
  const handed = await cmd('pay_refund', {
    refund_id: refund.id,
    amount: 20000,
    date,
    how_given: 'voucher',
    voucher_name: 'UA ETC from cancel',
  });
  assert.equal(handed.kind, 'customer_paid');
  assert.equal(handed.form, 'Voucher');
  assert.ok(handed.asset_id);
  const asset = (
    await db.query(`SELECT name, ownership, holder_id, remaining_basis, balance FROM asset_balances WHERE id=$1`, [
      handed.asset_id,
    ])
  ).rows[0];
  assert.equal(asset.name, 'UA ETC from cancel');
  assert.equal(asset.ownership, 'Customer');
  assert.equal(Number(asset.balance), 20000);
  assert.equal(Number(asset.remaining_basis), 0);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.customer_balance), 0);
});

test('pay_refund how_given other requires note and settles', async () => {
  const { booking, refund, account } = await seedRefundCase();
  await assert.rejects(
    () =>
      cmd('pay_refund', {
        refund_id: refund.id,
        amount: 5000,
        date,
        how_given: 'other',
      }),
    /reference|handling note/i,
  );
  const paid = await cmd('pay_refund', {
    refund_id: refund.id,
    amount: 20000,
    date,
    how_given: 'other',
    reference: 'Paid via gift card outside app',
    account_id: account.id,
    method: 'ACH',
  });
  assert.equal(paid.kind, 'customer_paid');
  assert.equal(paid.form, 'other');
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.customer_balance), 0);
});
