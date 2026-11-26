import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  authorizedPayersEmptyHint,
  formatAuthorizedPayerLine,
  normalizeAuthorizedPayers,
} from '../src/lib/booking-payers';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';
import { detail } from '../src/lib/queries';

test('normalizeAuthorizedPayers skips blank ids/names; never invents', () => {
  assert.deepEqual(
    normalizeAuthorizedPayers([
      { party_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Acme Corp', reason: 'Company pays' },
      { party_id: '', name: 'Nope' },
      { party_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: '  ' },
    ]),
    [
      {
        party_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Acme Corp',
        reason: 'Company pays',
        command_id: null,
      },
    ],
  );
  assert.match(authorizedPayersEmptyHint(), /billed customer/i);
  assert.equal(
    formatAuthorizedPayerLine({
      party_id: 'x',
      name: 'Pat',
      reason: 'Family',
    }),
    'Pat · Family',
  );
});

let db: Database;
let owner: Actor;
const ownerPassword = 'Synthetic owner password for booking payers tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Payers Owner',
    email: 'booking-payers-owner@example.invalid',
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

test('booking detail lists authorized payers after authorize_payer', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Billed Customer',
    roles: ['customer', 'traveler'],
  });
  const payer = await cmd('party', {
    kind: 'company',
    name: 'Third Party Payer Co',
    roles: ['customer'],
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'Payers visibility',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 50000,
  });
  let d = await detail(db, owner, 'booking', booking.id);
  assert.deepEqual(d.authorizedPayers, []);
  await cmd('authorize_payer', {
    booking_id: booking.id,
    party_id: payer.id,
    reason: 'Customer asked company to pay',
  });
  d = await detail(db, owner, 'booking', booking.id);
  assert.equal(d.authorizedPayers.length, 1);
  assert.equal(d.authorizedPayers[0].party_id, payer.id);
  assert.equal(d.authorizedPayers[0].name, 'Third Party Payer Co');
  assert.equal(d.authorizedPayers[0].reason, 'Customer asked company to pay');
});
