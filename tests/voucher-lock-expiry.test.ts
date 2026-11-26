import assert from 'node:assert/strict';
import test from 'node:test';
import { after, before } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  isTravelerLockedVoucher,
  voucherLockDisplayLabel,
} from '../src/lib/voucher-traveler-lock';
import { buildVoucherExpiryReminders } from '../src/lib/voucher-expiry';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';

test('Padova voucher with holder is locked; Cap1/points are not', () => {
  assert.equal(
    isTravelerLockedVoucher({ ownership: 'Padova', holder_id: 't1', kind: 'Voucher' }),
    true,
  );
  assert.equal(
    isTravelerLockedVoucher({ ownership: 'Padova', holder_id: null, kind: 'Voucher' }),
    false,
  );
  assert.equal(
    isTravelerLockedVoucher({ ownership: 'Customer', holder_id: 't1', kind: 'Voucher' }),
    false,
  );
  assert.equal(
    isTravelerLockedVoucher({ ownership: 'Padova', holder_id: 't1', kind: 'Capital One credit' }),
    false,
  );
  assert.equal(
    isTravelerLockedVoucher({ ownership: 'Padova', holder_id: 't1', kind: 'Points' }),
    false,
  );
  assert.match(voucherLockDisplayLabel('Raizy'), /Locked to Raizy/);
});

test('expiry reminders use Held-PNR urgency bands', () => {
  const today = '2026-11-25';
  const rem = buildVoucherExpiryReminders(
    [
      { id: 'a1', name: 'UA ETC', kind: 'Voucher', balance: 50000, expires_on: '2026-11-20' },
      { id: 'a2', name: 'Far', kind: 'Voucher', balance: 10000, expires_on: '2026-12-31' },
      { id: 'a3', name: 'Zero', kind: 'Voucher', balance: 0, expires_on: '2026-11-20' },
      { id: 'a4', name: 'Soon', kind: 'Hotel credit', balance: 20000, expires_on: '2026-11-27' },
    ],
    today,
  );
  assert.equal(rem.length, 2);
  assert.equal(rem.find((r) => r.record_id === 'a1')?.urgency, 'overdue');
  assert.equal(rem.find((r) => r.record_id === 'a4')?.urgency, 'due_soon');
  assert.equal(rem.find((r) => r.record_id === 'a1')?.due_on, '2026-11-20');
  assert.equal(rem.find((r) => r.record_id === 'a1')?.record_type, 'asset');
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for voucher lock tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Voucher Lock Owner',
    email: 'voucher-lock-owner@example.invalid',
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

test('locked Padova voucher funds only when traveler is on booking', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'VL Customer', roles: ['customer', 'traveler'] },
  });
  const traveler = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'VL Locked Traveler', roles: ['traveler', 'customer'] },
  });
  const other = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'VL Other Traveler', roles: ['traveler', 'customer'] },
  });
  const voucher = await execute(db, owner, {
    id: randomUUID(),
    kind: 'acquire_asset',
    data: {
      name: 'Locked UA voucher',
      kind: 'Voucher',
      issuer: 'United',
      quantity: 50000,
      cost: 40000,
      date,
      holder_id: traveler.id,
      ownership: 'Padova',
    },
  });
  const okBooking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'Direct',
      summary: 'With locked traveler',
      booked_on: date,
      travel_start: date,
      travel_end: date,
      sale: 50000,
      traveler_ids: [traveler.id],
    },
  });
  await execute(db, owner, {
    id: randomUUID(),
    kind: 'fund',
    data: {
      booking_id: okBooking.id,
      kind: 'Voucher',
      asset_id: voucher.id,
      face_amount: 50000,
      date,
    },
  });
  const badBooking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'Direct',
      summary: 'Wrong traveler',
      booked_on: date,
      travel_start: date,
      travel_end: date,
      sale: 50000,
      traveler_ids: [other.id],
    },
  });
  const voucher2 = await execute(db, owner, {
    id: randomUUID(),
    kind: 'acquire_asset',
    data: {
      name: 'Locked UA voucher 2',
      kind: 'Voucher',
      issuer: 'United',
      quantity: 30000,
      cost: 25000,
      date,
      holder_id: traveler.id,
      ownership: 'Padova',
    },
  });
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'fund',
        data: {
          booking_id: badBooking.id,
          kind: 'Voucher',
          asset_id: voucher2.id,
          face_amount: 30000,
          date,
        },
      }),
    /locked to VL Locked Traveler/i,
  );
});
