import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  buildApplyHeldCreditDefaults,
  heldCustomerCreditCents,
  pickBookingForHeldCreditApply,
  planCustomerCreditReturn,
  unallocatedCustomerSlices,
} from '../src/lib/customer-wallet';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';
import type { WalletPayment } from '../src/lib/customer-wallet';

test('held credit sums unallocated customer receipts only', () => {
  const party = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert.equal(
    heldCustomerCreditCents(
      [
        {
          id: '1',
          party_id: party,
          direction: 'customer',
          current_amount: 5000,
          allocated: 2000,
          commission_allocated: 0,
        },
        {
          id: '2',
          party_id: party,
          direction: 'customer',
          current_amount: 1000,
          allocated: 1000,
          commission_allocated: 0,
        },
        {
          id: '3',
          party_id: other,
          direction: 'customer',
          current_amount: 9000,
          allocated: 0,
          commission_allocated: 0,
        },
        {
          id: '4',
          party_id: party,
          direction: 'supplier',
          current_amount: 8000,
          allocated: 0,
          commission_allocated: 0,
        },
      ],
      party,
    ),
    3000,
  );
});

test('buildApplyHeldCreditDefaults picks FIFO slice capped at booking AR', () => {
  const party = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const payments = [
    {
      id: 'old',
      party_id: party,
      direction: 'customer' as const,
      paid_on: '2026-11-01',
      current_amount: 8000,
      allocated: 0,
    },
    {
      id: 'new',
      party_id: party,
      direction: 'customer' as const,
      paid_on: '2026-11-20',
      current_amount: 5000,
      allocated: 0,
    },
  ];
  const apply = buildApplyHeldCreditDefaults({
    payments,
    partyId: party,
    bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    bookingBalanceCents: 4500,
  });
  assert.deepEqual(apply, {
    payment_id: 'old',
    booking_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    amount_cents: 4500,
    amount: 45,
  });
  assert.equal(
    buildApplyHeldCreditDefaults({
      payments,
      partyId: party,
      bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      bookingBalanceCents: 0,
    }),
    null,
  );
  assert.equal(
    buildApplyHeldCreditDefaults({
      payments: [],
      partyId: party,
      bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      bookingBalanceCents: 1000,
    }),
    null,
  );
  const target = pickBookingForHeldCreditApply([
    { id: 'b2', customer_balance: 2000, booked_on: '2026-11-20' },
    { id: 'b1', customer_balance: 5000, booked_on: '2026-11-01' },
    { id: 'b0', customer_balance: 0, booked_on: '2026-10-01' },
  ]);
  assert.deepEqual(target, { id: 'b1', balance_cents: 5000 });
  assert.equal(pickBookingForHeldCreditApply([{ id: 'x', customer_balance: 0 }]), null);
});

test('FIFO return plan never invents slices', () => {
  const plan = planCustomerCreditReturn(
    [
      { payment_id: 'a', unallocated: 1000 },
      { payment_id: 'b', unallocated: 2500 },
    ],
    3000,
  );
  assert.deepEqual(plan, [
    { payment_id: 'a', reduce_by: 1000 },
    { payment_id: 'b', reduce_by: 2000 },
  ]);
  assert.throws(() => planCustomerCreditReturn([{ payment_id: 'a', unallocated: 500 }], 501));
  assert.deepEqual(
    unallocatedCustomerSlices(
      [
        {
          id: 'b',
          party_id: 'p',
          direction: 'customer',
          paid_on: '2026-11-20',
          current_amount: 2000,
          allocated: 0,
        },
        {
          id: 'a',
          party_id: 'p',
          direction: 'customer',
          paid_on: '2026-11-10',
          current_amount: 1000,
          allocated: 0,
        },
      ],
      'p',
    ).map((s) => s.payment_id),
    ['a', 'b'],
  );
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for customer wallet tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Wallet Owner',
    email: 'wallet-owner@example.invalid',
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

test('deposit holds as wallet; apply and return clear held credit', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Wallet Customer',
    roles: ['customer', 'traveler'],
  });
  const account = await cmd('payment_account', {
    name: 'Wallet Operating',
    kind: 'Bank',
  });
  await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 15000,
    date,
    method: 'Zelle',
    reference: 'Deposit before booking',
    account_id: account.id,
    allocations: [],
  });
  async function walletRows(): Promise<WalletPayment[]> {
    return (
      await db.query(
        `SELECT id, party_id, direction, paid_on, current_amount, allocated, commission_allocated
         FROM payment_balances WHERE party_id=$1`,
        [customer.id],
      )
    ).rows as WalletPayment[];
  }
  let balances = await walletRows();
  assert.equal(heldCustomerCreditCents(balances, customer.id), 15000);

  const booking = await cmd('booking', {
    customer_id: customer.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Use deposit',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 10000,
  });
  const depositId = balances[0].id;
  await cmd('allocate', {
    payment_id: depositId,
    booking_id: booking.id,
    amount: 10000,
    date,
  });
  balances = await walletRows();
  assert.equal(heldCustomerCreditCents(balances, customer.id), 5000);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.customer_balance), 0);

  await cmd('return_customer_credit', {
    party_id: customer.id,
    amount: 5000,
    date,
    method: 'Zelle',
    account_id: account.id,
    reason: 'Customer asked for deposit back',
    reference: 'Return deposit',
  });
  balances = await walletRows();
  assert.equal(heldCustomerCreditCents(balances, customer.id), 0);
  const refunds = (
    await db.query(
      `SELECT amount FROM payments WHERE party_id=$1 AND direction='customer_refund'`,
      [customer.id],
    )
  ).rows;
  assert.equal(refunds.length, 1);
  assert.equal(Number(refunds[0].amount), 5000);
});

test('pay_refund how_given customer_credit holds wallet credit', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Refund Credit Customer',
    roles: ['customer', 'traveler'],
  });
  const supplier = await cmd('party', {
    kind: 'supplier',
    name: 'Refund Credit Hotel',
    roles: ['seller'],
  });
  const account = await cmd('payment_account', {
    name: 'Refund Credit Bank',
    kind: 'Bank',
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Refund kept as credit',
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
    reason: 'Cancelled — keep as credit',
  });
  await cmd('receive_refund', {
    refund_id: refund.id,
    amount: 15000,
    form: 'cash',
    date,
    method: 'ACH',
    account_id: account.id,
  });
  const handed = await cmd('pay_refund', {
    refund_id: refund.id,
    amount: 20000,
    date,
    how_given: 'customer_credit',
  });
  assert.equal(handed.kind, 'customer_credit_handed_over');
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.customer_balance), 0);
  const balances = (
    await db.query(
      `SELECT id, party_id, direction, paid_on, current_amount, allocated, commission_allocated
       FROM payment_balances WHERE party_id=$1`,
      [customer.id],
    )
  ).rows as WalletPayment[];
  assert.equal(heldCustomerCreditCents(balances, customer.id), 20000);
  const cashRefunds = (
    await db.query(
      `SELECT id FROM payments WHERE party_id=$1 AND direction='customer_refund'`,
      [customer.id],
    )
  ).rows;
  assert.equal(cashRefunds.length, 0);
});

test('return cannot exceed held credit', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Thin Wallet',
    roles: ['customer'],
  });
  const account = await cmd('payment_account', {
    name: 'Thin Bank',
    kind: 'Bank',
  });
  await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 2000,
    date,
    method: 'ACH',
    account_id: account.id,
    allocations: [],
  });
  await assert.rejects(
    () =>
      cmd('return_customer_credit', {
        party_id: customer.id,
        amount: 2001,
        date,
        method: 'ACH',
        account_id: account.id,
        reason: 'Too much',
      }),
    /exceeds held customer credit/i,
  );
});
