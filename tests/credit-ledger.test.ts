import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assetMatchesCap1ProfileFilter,
  cap1ProfileBalanceLabel,
  creditLedgerStatus,
  isCreditVoided,
  listCap1ProfileBalances,
  openingQuantityFromMovements,
  profileCreditBalanceCents,
  toggleCap1ProfileFilter,
} from '../src/lib/credit-ledger';

test('credit status held / partly used / used / voided', () => {
  assert.equal(
    creditLedgerStatus({ kind: 'Capital One credit', balance: 10000, opening_quantity: 10000 }),
    'held',
  );
  assert.equal(
    creditLedgerStatus({ kind: 'Capital One credit', balance: 4000, opening_quantity: 10000 }),
    'partly used',
  );
  assert.equal(
    creditLedgerStatus({ kind: 'Capital One credit', balance: 0, opening_quantity: 10000 }),
    'used',
  );
  assert.equal(
    creditLedgerStatus({
      kind: 'Capital One credit',
      balance: 5000,
      opening_quantity: 10000,
      voided: true,
    }),
    'voided',
  );
  assert.equal(creditLedgerStatus({ kind: 'Voucher', balance: 100 }), null);
});

test('opening and void detection from movements', () => {
  assert.equal(
    openingQuantityFromMovements([
      { kind: 'earned_credit', quantity: 19792 },
      { kind: 'void', quantity: -19792 },
    ]),
    19792,
  );
  assert.equal(isCreditVoided([{ kind: 'void' }]), true);
  assert.equal(isCreditVoided([{ kind: 'booking_use' }]), false);
});

test('profile balance skips voided and marks incomplete when balance unknown', () => {
  const sum = profileCreditBalanceCents(
    [
      { profile_id: 'p1', asset_id: 'a1' },
      { profile_id: 'p1', asset_id: 'a2' },
      { profile_id: 'p1', asset_id: 'a3' },
    ],
    [
      { id: 'a1', kind: 'Capital One credit', balance: 10000 },
      { id: 'a2', kind: 'Capital One credit', balance: 5000, voided: true },
      { id: 'a3', kind: 'Capital One credit', balance: null },
    ],
    'p1',
  );
  assert.equal(sum.balance_cents, 10000);
  assert.equal(sum.incomplete, true);
  assert.equal(sum.credit_count, 2);
});

test('listCap1ProfileBalances shows remaining per Active profile', () => {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rows = listCap1ProfileBalances(
    [
      { id: 'p1', name: 'Profile A', status: 'Active' },
      { id: 'p2', name: 'Profile B', status: 'Active', provider: 'Capital One' },
      { id: 'p3', name: 'Archived', status: 'Inactive' },
    ],
    [
      { profile_id: 'p1', asset_id: 'a1' },
      { profile_id: 'p2', asset_id: 'a2' },
    ],
    [
      { id: 'a1', kind: 'Capital One credit', balance: 19792 },
      { id: 'a2', kind: 'Capital One credit', balance: null },
    ],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Profile A');
  assert.equal(rows[0].balance_cents, 19792);
  assert.equal(cap1ProfileBalanceLabel(rows[0], money), '$197.92');
  assert.equal(rows[1].name, 'Profile B');
  assert.equal(rows[1].balance_cents, null);
  assert.equal(rows[1].incomplete, true);
  assert.equal(cap1ProfileBalanceLabel(rows[1], money), 'Incomplete');
});

test('Cap1 profile filter: All shows all; profile id matches links; blank ≠ invent', () => {
  const links = [
    { profile_id: 'p1', asset_id: 'a1' },
    { profile_id: 'p2', asset_id: 'a2' },
  ];
  assert.equal(assetMatchesCap1ProfileFilter('a1', 'All', links), true);
  assert.equal(assetMatchesCap1ProfileFilter('a1', null, links), true);
  assert.equal(assetMatchesCap1ProfileFilter('a1', 'p1', links), true);
  assert.equal(assetMatchesCap1ProfileFilter('a2', 'p1', links), false);
  assert.equal(assetMatchesCap1ProfileFilter('a1', 'p-missing', links), false);
  assert.equal(assetMatchesCap1ProfileFilter('', 'p1', links), false);
  assert.equal(assetMatchesCap1ProfileFilter(null, 'p1', links), false);
  assert.equal(toggleCap1ProfileFilter('All', 'p1'), 'p1');
  assert.equal(toggleCap1ProfileFilter('p1', 'p1'), 'All');
  assert.equal(toggleCap1ProfileFilter('p1', 'p2'), 'p2');
  assert.equal(toggleCap1ProfileFilter('All', ''), 'All');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /assetMatchesCap1ProfileFilter/);
  assert.match(src, /toggleCap1ProfileFilter/);
  assert.match(src, /Filter credits for/);
  assert.match(src, /Clear Cap1 profile filter/);
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for Cap1 credit ledger tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Credit Owner',
    email: 'credit-owner@example.invalid',
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

async function seedBookingWithProfile() {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'Cap1 Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'Cap1 Airline', roles: ['seller', 'airline'] },
  });
  const method = (
    await db.query("SELECT id FROM booking_source_methods WHERE name='Capital One Travel'")
  ).rows[0];
  assert.ok(method?.id, 'Capital One Travel method seeded');
  const profile = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking_source_profile',
    data: {
      name: 'Cap1 Profile A',
      source_method_id: method.id,
      provider: 'Capital One',
      status: 'Active',
    },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Flight',
      channel: 'Capital One',
      summary: 'Cap1 credit void case',
      booked_on: date,
      travel_start: '2026-12-01',
      travel_end: '2026-12-05',
      sale: 79060,
    },
  });
  return { booking, profile, method };
}

test('acquire_asset Cap1 credit requires profile and links source_profile_assets', async () => {
  const method = (
    await db.query("SELECT id FROM booking_source_methods WHERE name='Capital One Travel'")
  ).rows[0];
  assert.ok(method?.id);
  const profile = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking_source_profile',
    data: {
      name: 'Cap1 Buy Profile',
      source_method_id: method.id,
      provider: 'Capital One',
      status: 'Active',
    },
  });
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'acquire_asset',
        data: {
          name: 'Bought Cap1 credit',
          kind: 'Capital One credit',
          issuer: 'Capital One',
          quantity: 30000,
          cost: 21000,
          date,
          ownership: 'Padova',
        },
      }),
    /Cap1 account profile/i,
  );
  const asset = await execute(db, owner, {
    id: randomUUID(),
    kind: 'acquire_asset',
    data: {
      name: 'Bought Cap1 credit',
      kind: 'Capital One credit',
      issuer: 'Capital One',
      quantity: 30000,
      cost: 21000,
      date,
      ownership: 'Padova',
      profile_id: profile.id,
    },
  });
  const link = await one(
    db,
    'SELECT profile_id FROM source_profile_assets WHERE asset_id=$1',
    [asset.id],
  );
  assert.equal(link.profile_id, profile.id);
  const bal = profileCreditBalanceCents(
    [{ profile_id: profile.id, asset_id: asset.id }],
    [{ id: asset.id, kind: 'Capital One credit', balance: 30000 }],
    profile.id,
  );
  assert.equal(bal.balance_cents, 30000);
  // Non-Cap1 acquire still works without profile.
  const voucher = await execute(db, owner, {
    id: randomUUID(),
    kind: 'acquire_asset',
    data: {
      name: 'Hotel voucher',
      kind: 'Voucher',
      issuer: 'Marriott',
      quantity: 10000,
      cost: 8000,
      date,
      ownership: 'Padova',
    },
  });
  assert.ok(voucher.id);
  const voucherLinks = (
    await db.query('SELECT 1 FROM source_profile_assets WHERE asset_id=$1', [voucher.id])
  ).rows;
  assert.equal(voucherLinks.length, 0);
});

test('void_credit zeros remaining Cap1 face and reverses earned credit', async () => {
  const { booking, profile } = await seedBookingWithProfile();
  const credit = await execute(db, owner, {
    id: randomUUID(),
    kind: 'benefit',
    data: {
      booking_id: booking.id,
      name: 'PM credit',
      amount: 19792,
      date,
      profile_id: profile.id,
    },
  });
  const before = await one(db, 'SELECT balance FROM asset_balances WHERE id=$1', [credit.id]);
  assert.equal(Number(before.balance), 19792);
  const voided = await execute(db, owner, {
    id: randomUUID(),
    kind: 'void_credit',
    data: { asset_id: credit.id, date, reason: 'Itinerary cancelled after price match' },
  });
  assert.equal(voided.status, 'voided');
  const after = await one(db, 'SELECT balance FROM asset_balances WHERE id=$1', [credit.id]);
  assert.equal(Number(after.balance), 0);
  const voidMove = await one(
    db,
    `SELECT count(*)::int AS n FROM asset_movements WHERE asset_id=$1 AND kind='void'`,
    [credit.id],
  );
  assert.ok(Number(voidMove.n) > 0);
  const profit = await one(
    db,
    `SELECT COALESCE(sum(amount),0)::bigint AS amount FROM profit_movements
     WHERE booking_id=$1 AND kind IN ('earned_credit','credit_void')`,
    [booking.id],
  );
  assert.equal(Number(profit.amount), 0);
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'void_credit',
        data: { asset_id: credit.id, date, reason: 'again' },
      }),
    /already voided/i,
  );
});
