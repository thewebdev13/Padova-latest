import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  BOOKING_EXTRA_CATEGORIES,
  bookingExtraChargeKind,
  isBookingExtraChargeKind,
} from '../src/lib/booking-extras';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import {
  bootstrapOwner,
  login,
  sessionActor,
  createUser,
  issueRecovery,
  completeRecovery,
} from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute, economics } from '../src/lib/finance';

test('extra charge kind labels', () => {
  assert.deepEqual(BOOKING_EXTRA_CATEGORIES, ['Seat', 'Bag', 'Other']);
  assert.equal(bookingExtraChargeKind('Seat'), 'Extra: Seat');
  assert.equal(isBookingExtraChargeKind('Extra: Bag'), true);
  assert.equal(isBookingExtraChargeKind('Booking fee'), false);
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for booking extras tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Extras Owner',
    email: 'extras-owner@example.invalid',
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

async function setupBooking() {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Extras Customer',
    roles: ['customer', 'traveler'],
  });
  const supplier = await cmd('party', {
    kind: 'supplier',
    name: 'Extras Airline',
    roles: ['seller'],
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'JFK-TLV',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 100000,
  });
  return { customer, supplier, booking };
}

test('seat customer price only increases sale', async () => {
  const { booking } = await setupBooking();
  const result = await cmd('booking_extra', {
    booking_id: booking.id,
    category: 'Seat',
    description: '1A extra legroom',
    customer_amount: 7500,
    date,
  });
  assert.equal(result.customer_amount, 7500);
  assert.equal(result.cost_amount, null);
  assert.ok(result.charge_id);
  assert.equal(result.funding_id, undefined);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.sale), 107500);
  const charge = await one(db, 'SELECT kind, amount FROM charges WHERE id=$1', [result.charge_id]);
  assert.equal(charge.kind, 'Extra: Seat');
  assert.equal(Number(charge.amount), 7500);
});

test('bag cost only posts funding; blank customer stays Unknown', async () => {
  const { booking, supplier } = await setupBooking();
  const result = await cmd('booking_extra', {
    booking_id: booking.id,
    category: 'Bag',
    description: '2 checked bags',
    cost_amount: 12000,
    payee_id: supplier.id,
    date,
  });
  assert.equal(result.customer_amount, null);
  assert.equal(result.cost_amount, 12000);
  assert.ok(result.funding_id);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.sale), 100000);
  assert.equal(Number(eco.funding_cost), 12000);
});

test('both sides share one command_id', async () => {
  const { booking, supplier } = await setupBooking();
  const id = randomUUID();
  await execute(db, owner, {
    id,
    kind: 'booking_extra',
    data: {
      booking_id: booking.id,
      category: 'Other',
      description: 'Priority boarding',
      customer_amount: 5000,
      cost_amount: 2000,
      payee_id: supplier.id,
      date,
    },
  });
  const charges = (
    await db.query('SELECT amount FROM charges WHERE command_id=$1', [id])
  ).rows;
  const funding = (
    await db.query('SELECT cost FROM funding_components WHERE command_id=$1', [id])
  ).rows;
  assert.equal(charges.length, 1);
  assert.equal(funding.length, 1);
  assert.equal(Number(charges[0].amount), 5000);
  assert.equal(Number(funding[0].cost), 2000);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.sale), 105000);
  assert.equal(Number(eco.funding_cost), 2000);
});

test('description-only records note without inventing money', async () => {
  const { booking } = await setupBooking();
  const result = await cmd('booking_extra', {
    booking_id: booking.id,
    category: 'Seat',
    description: 'Window requested — price TBD',
    date,
  });
  assert.equal(result.customer_amount, null);
  assert.equal(result.cost_amount, null);
  assert.equal(result.charge_id, undefined);
  assert.equal(result.funding_id, undefined);
  const eco = await economics(db, booking.id);
  assert.equal(Number(eco.sale), 100000);
  assert.equal(Number(eco.funding_cost), 0);
});

test('cost without funding permission is rejected', async () => {
  const { booking, supplier } = await setupBooking();
  const created = await createUser(db, owner, {
    name: 'Extras Worker',
    email: 'extras-worker@example.invalid',
    permissions: ['operations', 'edit_customer_charges', 'edit_payments'],
    role: 'EMPLOYEE',
  });
  const recovery = await issueRecovery(db, owner, created.id);
  const password = 'Synthetic extras worker password only';
  await completeRecovery(db, { token: recovery.token, password });
  const staff = (await sessionActor(
    db,
    (await login(db, { email: created.email, password })).token,
  ))!;
  await assert.rejects(
    () =>
      execute(db, staff, {
        id: randomUUID(),
        kind: 'booking_extra',
        data: {
          booking_id: booking.id,
          category: 'Bag',
          cost_amount: 1000,
          payee_id: supplier.id,
          date,
        },
      }),
    /Permission required: manage_funding/,
  );
});
