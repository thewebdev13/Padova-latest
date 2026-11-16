import { OWNER_PERMISSIONS } from '../src/lib/permissions';
const seedActor = {
  id: 'synthetic-seed',
  name: 'Synthetic seed import',
  permissions: [...OWNER_PERMISSIONS],
};
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate } from '../src/lib/db';
import { execute, CommandKind } from '../src/lib/finance';
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Synthetic seed is local-only; cloud seeding is prohibited');
const db = await createDatabase();
const run = (kind: CommandKind, data: unknown) =>
  execute(db, seedActor, { id: randomUUID(), kind, data });
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const plus = (days: number) =>
  new Date(new Date(today).getTime() + days * 86400000).toISOString().slice(0, 10);
try {
  await migrate(db);
  if ((await db.query('SELECT id FROM parties LIMIT 1')).rows.length) {
    console.log('Database has records; seed skipped.');
  } else {
    const family = await run('party', {
      kind: 'family',
      name: 'Levin Household',
      roles: ['customer'],
    });
    const company = await run('party', {
      kind: 'company',
      name: 'Northstar Design Co.',
      email: 'travel@example.invalid',
      roles: ['customer'],
      details: {
        travel_rules: 'Economy for flights under 6 hours. Breakfast included for hotels.',
        billing_contact: 'Demo billing contact',
      },
    });
    const sarah = await run('party', {
      kind: 'person',
      name: 'Sarah Levin',
      email: 'sarah@example.invalid',
      phone: '+1 202 555 0142',
      roles: ['traveler', 'customer'],
    });
    const daniel = await run('party', {
      kind: 'person',
      name: 'Daniel Levin',
      email: 'daniel@example.invalid',
      roles: ['traveler'],
    });
    const maya = await run('party', {
      kind: 'person',
      name: 'Maya Cohen',
      roles: ['traveler', 'employee'],
    });
    const david = await run('party', {
      kind: 'person',
      name: 'David Adler',
      roles: ['traveler', 'customer'],
    });
    const hotel = await run('party', {
      kind: 'supplier',
      name: 'The Carlton Hotel',
      roles: ['seller', 'property'],
    });
    const airline = await run('party', {
      kind: 'supplier',
      name: 'United Airlines',
      roles: ['seller', 'airline'],
    });
    const seller = await run('party', {
      kind: 'partner',
      name: 'Atlas Travel Partners',
      roles: ['seller', 'collector'],
    });
    const referrer = await run('party', { kind: 'person', name: 'Ari Rosen', roles: ['referrer'] });
    for (const p of [sarah, daniel])
      await run('relationship', {
        person_id: p.id,
        group_id: family.id,
        relationship: 'family member',
      });
    await run('relationship', {
      person_id: maya.id,
      group_id: company.id,
      relationship: 'employee',
    });
    await run('traveler', {
      person_id: sarah.id,
      legal_first: 'Sarah',
      last_name: 'Levin',
      dob: '1991-04-29',
      preferences: { seat: 'Aisle', meal: 'Kosher' },
      memberships: [{ program: 'United', number: 'DEMO-12345' }],
    });
    const b1 = await run('booking', {
      customer_id: sarah.id,
      supplier_id: airline.id,
      product: 'Flight',
      channel: 'Direct Airline',
      summary: 'New York → London',
      booked_on: today,
      travel_start: today,
      travel_end: plus(7),
      traveler_ids: [sarah.id, daniel.id],
      confirmations: ['DEMO-LHR'],
      sale: 245000,
      itinerary: { route: 'EWR → LHR', departure: '21:15', flight: 'UA 14' },
    });
    await run('fund', {
      booking_id: b1.id,
      kind: 'Amex Business • 1234',
      face_amount: 205000,
      cost: 205000,
      date: today,
    });
    await run('payment', {
      party_id: sarah.id,
      direction: 'customer',
      amount: 150000,
      date: today,
      method: 'ACH',
      reference: 'DEMO-ACH-001',
      allocations: [{ booking_id: b1.id, amount: 150000 }],
    });
    const a1 = await run('acquire_asset', {
      name: 'Carlton hotel credit',
      kind: 'Hotel credit',
      issuer: 'Carlton',
      quantity: 200000,
      cost: 160000,
      seller_id: seller.id,
      date: today,
      expires_on: plus(180),
    });
    const b2 = await run('booking', {
      customer_id: company.id,
      supplier_id: hotel.id,
      product: 'Hotel',
      channel: 'Seller / Source Partner',
      summary: 'London · The Carlton · 3 nights',
      booked_on: today,
      travel_start: plus(3),
      travel_end: plus(6),
      traveler_ids: [maya.id],
      confirmations: ['DEMO-HTL'],
      sale: 118000,
    });
    await run('fund', {
      booking_id: b2.id,
      kind: 'Purchased hotel credit',
      asset_id: a1.id,
      face_amount: 100000,
      date: today,
    });
    await run('fund', {
      booking_id: b2.id,
      kind: 'Card taxes & fees',
      seller_id: hotel.id,
      face_amount: 4000,
      cost: 4000,
      date: today,
    });
    await run('commission', {
      booking_id: b2.id,
      payer_id: hotel.id,
      collector_id: seller.id,
      gross: 10000,
      retained: 1000,
      due_on: plus(36),
      date: today,
    });
    await run('referral', {
      booking_id: b2.id,
      referrer_id: referrer.id,
      basis: 'profit',
      rate_bps: 2000,
      due_on: plus(36),
      date: today,
    });
    const b3 = await run('booking', {
      customer_id: david.id,
      supplier_id: airline.id,
      product: 'Flight',
      channel: 'Capital One',
      summary: 'Tel Aviv → Paris',
      booked_on: today,
      travel_start: plus(9),
      travel_end: plus(14),
      traveler_ids: [david.id],
      confirmations: ['DEMO-CDG'],
      sale: 98000,
    });
    await run('fund', {
      booking_id: b3.id,
      kind: 'Capital One card • 9012',
      seller_id: airline.id,
      face_amount: 100000,
      cost: 100000,
      date: today,
    });
    await run('benefit', {
      booking_id: b3.id,
      name: 'Capital One · price match',
      amount: 25000,
      date: today,
      expires_on: plus(365),
    });
    await run('payment', {
      party_id: david.id,
      direction: 'customer',
      amount: 100000,
      date: today,
      method: 'Zelle',
      reference: 'DEMO-ZELLE-002',
      allocations: [{ booking_id: b3.id, amount: 98000 }],
    });
    await run('acquire_asset', {
      name: 'United MileagePlus · Padova',
      kind: 'Points',
      issuer: 'United',
      quantity: 180000,
      cost: 216000,
      date: today,
      expires_on: plus(365),
      restrictions: 'Synthetic account; no real loyalty credentials',
    });
    await run('acquire_asset', {
      name: 'Airline voucher · spring inventory',
      kind: 'Voucher',
      issuer: 'United',
      quantity: 75000,
      cost: 63750,
      date: today,
      expires_on: plus(22),
    });
    await run('task', {
      title: 'Confirm Carlton arrival details',
      record_type: 'booking',
      record_id: b2.id,
      due_on: plus(1),
      priority: 'High',
      notes: 'Synthetic follow-up for local development.',
    });
    await run('task', {
      title: 'Review unallocated customer credit',
      due_on: today,
      priority: 'Normal',
    });
    await run('note', {
      record_type: 'booking',
      record_id: b1.id,
      body: 'Synthetic demonstration booking. No reservation has been made or sent to a client.',
    });
    console.log('Synthetic development data created. No historical sources used.');
  }
} finally {
  await db.close();
}
