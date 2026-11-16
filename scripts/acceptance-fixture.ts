import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase, migrate } from '../src/lib/db';
import { bootstrapOwner } from '../src/lib/users';
import { execute, type CommandKind } from '../src/lib/finance';
import { OWNER_PERMISSIONS } from '../src/lib/permissions';

// Disposable synthetic local test fixture, never a Supabase migration or live seed.
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Local synthetic acceptance only');
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
const db = await createDatabase();
try {
  await migrate(db);
  if (Number((await db.query('SELECT count(*) n FROM staff')).rows[0].n))
    throw new Error('Acceptance fixture already exists; reuse it');
  const password = randomBytes(24).toString('base64url');
  const owner = await bootstrapOwner(db, {
    name: 'Demo Owner',
    email: 'demo@example.invalid',
    password,
  });
  const actor = {
    id: owner.id,
    name: owner.name,
    role: 'OWNER' as const,
    permissions: OWNER_PERMISSIONS,
  };
  const run = (kind: CommandKind, data: unknown) =>
    execute(db, actor, { id: randomUUID(), kind, data });
  const customer = await run('party', {
    kind: 'person',
    name: 'Demo Alex Morgan',
    roles: ['customer', 'traveler'],
  });
  const company = await run('party', {
    kind: 'company',
    name: 'Demo Northstar Company',
    roles: ['customer'],
  });
  const supplier = await run('party', {
    kind: 'supplier',
    name: 'Demo Airline',
    roles: ['supplier'],
  });
  await run('relationship', {
    person_id: customer.id,
    group_id: company.id,
    relationship: 'employee',
  });
  await run('traveler', {
    person_id: customer.id,
    legal_first: 'Alex',
    last_name: 'Morgan',
    preferences: { seat: 'Window' },
  });
  await run('payment_account', { name: 'Demo card ending 1234', kind: 'Card', last_four: '1234' });
  const date = '2026-10-28';
  const booking = await run('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct Airline',
    summary: 'Demo JFK–MIA acceptance booking',
    booked_on: date,
    travel_start: '2026-11-20',
    travel_end: '2026-11-22',
    traveler_ids: [customer.id],
    confirmations: ['DEMO01'],
    sale: 90000,
  });
  await run('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 70000,
    cost: 70000,
    settled: true,
    date,
  });
  await run('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 50000,
    method: 'Zelle',
    date,
    allocations: [{ booking_id: booking.id, amount: 50000 }],
  });
  await run('acquire_asset', {
    name: 'Demo travel voucher',
    kind: 'Voucher',
    issuer: 'Demo Airline',
    quantity: 100000,
    cost: 85000,
    date,
  });
  await run('commission', {
    booking_id: booking.id,
    payer_id: supplier.id,
    gross: 10000,
    retained: 1000,
    due_on: '2026-12-22',
    date,
  });
  await run('task', {
    title: 'Demo check itinerary',
    record_type: 'booking',
    record_id: booking.id,
    assignee_id: owner.id,
    due_on: '2026-11-18',
    priority: 'Normal',
  });
  await mkdir('.data', { recursive: true });
  await writeFile(
    '.data/owner-acceptance-access.json',
    JSON.stringify({ email: 'demo@example.invalid', password }),
  );
  console.log('Synthetic acceptance fixture ready. Credentials saved privately; no cloud writes.');
} finally {
  await db.close();
}
