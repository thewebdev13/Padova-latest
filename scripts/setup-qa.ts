import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, migrate } from '../src/lib/db';
import { bootstrapOwner, createUser, issueRecovery, completeRecovery } from '../src/lib/users';
import { execute, type CommandKind } from '../src/lib/finance';
import { OWNER_PERMISSIONS } from '../src/lib/permissions';
import { QA_PERMISSIONS, assertQAIsolation } from '../src/lib/qa';

assertQAIsolation();
if (process.env.PADOVA_QA !== '1') throw new Error('Use the isolated QA launcher');
if (existsSync('.data/remote-qa-access/ready.json'))
  throw new Error('QA already exists; reuse it without resetting financial history');
const db = await createDatabase();
try {
  await migrate(db);
  await db.exec(`ALTER TABLE bookings ALTER COLUMN code SET DEFAULT ('QA-' || nextval('booking_number'));
    CREATE TABLE IF NOT EXISTS qa_issues (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      reporter_id uuid NOT NULL REFERENCES staff(id), reporter_name text NOT NULL,
      type text NOT NULL CHECK(type IN ('Bug','Confusing','Missing','Too Slow','Suggestion')),
      section text NOT NULL, booking text NOT NULL DEFAULT '', expected text NOT NULL,
      happened text NOT NULL, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    );
    REVOKE ALL ON qa_issues FROM PUBLIC;
    ALTER TABLE qa_issues ENABLE ROW LEVEL SECURITY;`);
  const ownerPassword = randomBytes(24).toString('base64url');
  const existingOwner = (
    await db.query(
      "SELECT id,name FROM staff WHERE email='qa.owner@example.invalid' AND role='OWNER'",
    )
  ).rows[0];
  const owner =
    existingOwner ??
    (await bootstrapOwner(db, {
      name: 'QA Owner',
      email: 'qa.owner@example.invalid',
      password: ownerPassword,
    }));
  const actor = {
    id: owner.id,
    name: owner.name,
    role: 'OWNER' as const,
    permissions: OWNER_PERMISSIONS,
  };
  if (existingOwner) {
    const link = await issueRecovery(db, actor, owner.id);
    await completeRecovery(db, { token: link.token, password: ownerPassword });
  }
  const tester =
    (await db.query("SELECT id FROM staff WHERE email='qa.tester@example.invalid'")).rows[0] ??
    (await createUser(db, actor, {
      name: 'QA Tester',
      email: 'qa.tester@example.invalid',
      role: 'EMPLOYEE',
      permissions: QA_PERMISSIONS,
    }));
  const password = randomBytes(24).toString('base64url');
  const reset = await issueRecovery(db, actor, tester.id);
  await completeRecovery(db, { token: reset.token, password });
  await mkdir('.data/remote-qa-access', { recursive: true });
  await writeFile(
    '.data/remote-qa-access/owner.json',
    JSON.stringify({ email: 'qa.owner@example.invalid', password: ownerPassword }, null, 2),
  );
  await writeFile(
    '.data/remote-qa-access/tester.json',
    JSON.stringify({ email: 'qa.tester@example.invalid', password }, null, 2),
  );
  const run = async (kind: CommandKind, data: any) => {
    const table = (
      {
        party: 'parties',
        program: 'programs',
        instrument: 'instruments',
        program_account: 'program_accounts',
        payment_account: 'payment_accounts',
        acquire_asset: 'assets',
      } as Record<string, string>
    )[kind];
    if (table) {
      const found = (await db.query(`SELECT * FROM ${table} WHERE name=$1`, [data.name])).rows[0];
      if (found) return found;
    }
    return execute(db, actor, { id: randomUUID(), kind, data });
  };
  const ids: Record<string, string> = {};
  for (const [name, kind, roles] of [
    ['QA Alex Morgan', 'person', ['customer', 'traveler']],
    ['QA Jordan Taylor', 'person', ['customer', 'traveler']],
    ['QA Northstar Company', 'company', ['customer']],
    ['QA Atlas Seller', 'person', ['seller']],
    ['QA United Airlines', 'supplier', ['airline']],
    ['QA Delta Air Lines', 'supplier', ['airline']],
    ['QA American Airlines', 'supplier', ['airline']],
    ['QA Carlton Hotel', 'supplier', ['property']],
    ['QA Hertz Rental', 'supplier', ['rental']],
    ['QA Other Supplier', 'supplier', ['seller']],
  ] as const)
    ids[name] = (await run('party', { name, kind, roles })).id;
  for (const name of ['QA Alex Morgan', 'QA Jordan Taylor'])
    await run('traveler', {
      person_id: ids[name],
      legal_first: name.split(' ')[1],
      last_name: name.split(' ')[2],
      preferences: { seat: 'Aisle', notes: 'Synthetic QA traveler; never use real PII' },
    });
  for (const name of ['QA Amex Business Platinum', 'QA Capital One Card', 'QA Bank'])
    await run('payment_account', {
      name,
      kind: name === 'QA Bank' ? 'Bank' : 'Card',
      ownership: 'Padova',
      supported_methods: name === 'QA Bank' ? ['ACH', 'Bank transfer'] : ['Card'],
      ...(name === 'QA Bank' ? {} : { last_four: '1234' }),
    });
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  for (const [name, category] of [
    ['QA United MileagePlus', 'Airline'],
    ['QA AAdvantage', 'Airline'],
    ['QA Amex Membership Rewards', 'Bank'],
    ['QA Capital One Miles', 'Bank'],
    ['QA Hilton Honors', 'Hotel'],
  ] as const) {
    const program = await run('program', { name, category });
    const instrument = await run('instrument', {
      program_id: program.id,
      name: `${name} points`,
      unit: 'points',
      role: 'Both',
    });
    const account = await run('program_account', {
      program_id: program.id,
      holder_id: ids['QA Northstar Company'],
      name: `${name} synthetic account`,
      ownership: 'Padova',
      masked_reference: '0000',
    });
    await run('acquire_asset', {
      name: `${name} QA inventory`,
      kind: 'Points',
      issuer: name,
      unit: 'points',
      quantity: 500000,
      cost: 500000,
      date,
      instrument_id: instrument.id,
      program_account_id: account.id,
      holder_id: ids['QA Northstar Company'],
      restrictions: 'FAKE QA VALUE ONLY',
    });
  }
  for (const [name, unit, quantity, cost] of [
    ['QA Airline Voucher', 'money', 200000, 160000],
    ['QA Hotel Credit', 'money', 150000, 120000],
    ['QA Travel Certificate', 'count', 10, 50000],
  ] as const) {
    const program = await run('program', { name, category: 'Other' });
    const instrument = await run('instrument', {
      program_id: program.id,
      name,
      unit,
      role: 'Both',
    });
    await run('acquire_asset', {
      name,
      kind: unit === 'count' ? 'Certificate' : 'Voucher',
      issuer: name,
      unit,
      quantity,
      cost,
      date,
      instrument_id: instrument.id,
      restrictions: 'FAKE QA VALUE ONLY',
    });
  }
  await run('booking', {
    customer_id: ids['QA Alex Morgan'],
    product: 'Flight',
    channel: 'GDS',
    summary: 'QA example JFK → LHR — fake reservation',
    booked_on: date,
    travel_start: '2027-01-15',
    travel_end: '2027-01-22',
    sale: 95000,
    traveler_ids: [ids['QA Alex Morgan']],
    confirmations: ['QA-FAKE01'],
  });
  await mkdir('.data/remote-qa-access', { recursive: true });
  await writeFile(
    '.data/remote-qa-access/owner.json',
    JSON.stringify({ email: 'qa.owner@example.invalid', password: ownerPassword }, null, 2),
  );
  await writeFile(
    '.data/remote-qa-access/tester.json',
    JSON.stringify({ email: 'qa.tester@example.invalid', password }, null, 2),
  );
  await writeFile('.data/remote-qa-access/fixture.json', JSON.stringify(ids, null, 2));
  await writeFile(
    '.data/remote-qa-access/ready.json',
    JSON.stringify({ created_at: new Date().toISOString(), synthetic_only: true }),
  );
  console.log(
    'Synthetic QA ready. Individual credentials saved privately under .data/remote-qa-access. No production connection used.',
  );
} finally {
  await db.close();
}
