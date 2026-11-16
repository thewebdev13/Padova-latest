import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import { travelerSourceKey, travelerReviewRows } from '../src/lib/traveler-review';
import { bookingSearchTerms } from '../src/lib/booking-search';
import { dateLabel } from '../src/lib/display-date';
import { parseQuickPaste } from '../src/lib/quick-paste';
import { detail } from '../src/lib/queries';

test('undated commission and optional financial dates never crash workspace rendering', () => {
  assert.equal(dateLabel(null), 'Not set');
  assert.equal(dateLabel(undefined), 'Not set');
  assert.equal(dateLabel(''), 'Not set');
  assert.equal(dateLabel('not-a-date'), 'Unknown date');
  assert.equal(dateLabel('2027-02-10'), 'Feb 10');
});

test('non-flight paste retains checkout without a spurious one-way flight warning', () => {
  const hotel = parseQuickPaste(
    'Product: Hotel\nTrip Type: One Way\nCheck-in: 2027-03-10\nCheck-out: 2027-03-13',
  );
  assert.equal(hotel.fields.travel_end, '2027-03-13');
  assert.equal(hotel.issues.length, 0);
  assert.ok(
    parseQuickPaste('Product: Flight\nTrip Type: One Way\nReturn: 2027-03-13').issues.some((i) =>
      i.includes('Contradiction'),
    ),
  );
});

test('traveler source decisions retain history, stable claim identity and decisions beyond recent history limit', () => {
  const source = {
    workbook_id: 'synthetic',
    tab: 'Flights',
    row: 5,
    column: 'C',
    raw_text: 'Winter family',
  };
  const key = travelerSourceKey(source);
  const first = { id: 'a', created_at: '2026-10-01', source_key: key, status: 'Resolved' };
  const other = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    created_at: '2026-10-20',
    source_key: `other:${i}`,
    status: 'Held',
  }));
  assert.equal(travelerReviewRows([{ source }], [first, ...other])[0].decision?.status, 'Resolved');
  const revised = { ...first, id: 'b', created_at: '2026-10-25', status: 'Held' };
  assert.equal(travelerReviewRows([{ source }], [revised, first])[0].decision?.status, 'Held');
  assert.notEqual(travelerSourceKey({ ...source, raw_text: 'Winter, Alex' }), key);
  assert.deepEqual(source, {
    workbook_id: 'synthetic',
    tab: 'Flights',
    row: 5,
    column: 'C',
    raw_text: 'Winter family',
  });
});

test('Owner traveler mappings are audited, idempotent, nonfinancial and independently protected', async () => {
  const db = await financialDatabase();
  try {
    const run = (kind: any, data: any, id = randomUUID()) =>
      execute(db, testOwner, { id, kind, data });
    const person = await run('party', {
      kind: 'person',
      name: 'QA Alex Winter',
      roles: ['traveler'],
    });
    const source = {
      workbook_id: 'synthetic',
      tab: 'Flights',
      row: 5,
      column: 'C',
      raw_text: 'Winter family',
    };
    const data = {
      source_key: travelerSourceKey(source),
      source_locator: source,
      issue_type: 'Traveler source mapping',
      proposed_mapping: { action: 'Accept' },
      destination_ids: { traveler_ids: [person.id] },
      status: 'Resolved',
      decision: 'Synthetic explicit mapping evidence; no identity merge',
    };
    const before = (await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n;
    const commandId = randomUUID();
    const event = await run('review_resolution', data, commandId);
    assert.equal((await run('review_resolution', data, commandId)).id, event.id);
    assert.equal(event.actor, testOwner.id);
    const worker = await financialEmployee(db);
    await assert.rejects(
      execute(
        db,
        { ...worker, permissions: ['operations', 'manage_settings'] },
        { id: randomUUID(), kind: 'review_resolution', data },
      ),
      /Owner|permission/i,
    );
    await assert.rejects(
      run('review_resolution', { ...data, source_locator: { ...source, row: 6 } }),
      /locator/,
    );
    await assert.rejects(
      run('review_resolution', { ...data, destination_ids: { traveler_ids: [randomUUID()] } }),
      /eligible/,
    );
    await assert.rejects(run('review_resolution', { ...data, status: 'Held' }), /status/);
    assert.equal((await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n, before);
    assert.equal((await db.query('SELECT count(*) n FROM review_resolution_events')).rows[0].n, 1);
    const held = await run('review_resolution', {
      ...data,
      proposed_mapping: { action: 'Unsure' },
      status: 'Held',
      destination_ids: { traveler_ids: [] },
      decision: 'Keep ambiguity pending better evidence',
    });
    assert.equal(held.status, 'Held');
    assert.equal((await db.query('SELECT count(*) n FROM review_resolution_events')).rows[0].n, 2);
  } finally {
    await db.close();
  }
});

test('booking lookup includes profile, funding account, later notes and individual multicity legs', () => {
  const booking = {
    id: 'b',
    search_notes: 'Later reference Followup777',
    itinerary: {
      operational_entry: {
        source_profile_id: 'p',
        notes: 'Window seat',
        segments: [
          { origin: 'ATL', destination: 'LAX', date: '2027-02-04', flight_number: 'DL555' },
        ],
      },
    },
  };
  const state = {
    bookingSourceProfiles: [
      {
        id: 'p',
        name: 'QA Venture X',
        provider: 'Capital One',
        safe_identifier: '1234',
        holder_id: 'h',
      },
    ],
    parties: [{ id: 'h', name: 'QA Holder' }],
    paymentAccounts: [{ id: 'a', name: 'QA Amex' }],
    fundingComponents: [
      { booking_id: 'b', account_id: 'a', reference: 'Funding777' },
      { booking_id: 'other', reference: 'PrivateOtherBooking' },
    ],
  };
  const terms = bookingSearchTerms(booking, state).join(' ');
  for (const value of [
    'Followup777',
    'QA Venture X',
    'Capital One',
    '1234',
    'QA Holder',
    'ATL',
    'LAX',
    '2027-02-04',
    'DL555',
    'QA Amex',
    'Funding777',
  ])
    assert.ok(terms.includes(value), value);
  assert.ok(!terms.includes('PrivateOtherBooking'));
});

test('seller profile reads existing booking and acquisition payables, payments and related bookings with independent grants', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'QA source statement customer',
      kind: 'person',
      roles: ['customer'],
    });
    const seller = await run('party', {
      name: 'QA source statement seller',
      kind: 'person',
      roles: ['seller'],
    });
    const booking = await run('booking', {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'QA source statement',
      booked_on: '2026-10-31',
      travel_start: '2027-03-10',
      travel_end: '2027-03-10',
      sale: 100000,
    });
    await run('fund', {
      booking_id: booking.id,
      kind: 'Wire',
      face_amount: 70000,
      cost: 70000,
      seller_id: seller.id,
      date: '2026-10-31',
    });
    await run('payment', {
      direction: 'supplier',
      party_id: seller.id,
      amount: 30000,
      date: '2026-10-31',
      method: 'Wire',
      allocations: [{ booking_id: booking.id, amount: 30000 }],
    });
    const asset = await run('acquire_asset', {
      name: 'QA source statement voucher',
      kind: 'Voucher',
      issuer: 'QA issuer',
      quantity: 100000,
      cost: 80000,
      seller_id: seller.id,
      source_booking_id: booking.id,
      date: '2026-10-31',
    });
    await run('pay_asset_purchase', {
      asset_id: asset.id,
      amount: 10000,
      date: '2026-10-31',
      method: 'Wire',
    });
    const rowsBefore = (await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n;
    const full = await detail(db, testOwner, 'person', seller.id);
    assert.deepEqual(full.sourceBookingIds, [booking.id]);
    const balance = (rows: any[]) =>
      rows.reduce((sum, r) => sum + Number(r.credit) - Number(r.debit), 0);
    assert.equal(balance(full.sourceStatement), 110000);
    assert.equal(
      balance(full.sourceStatement.filter((r: any) => r.account === 'supplier_payable')),
      40000,
    );
    assert.equal(
      balance(full.sourceStatement.filter((r: any) => r.account === 'asset_acquisition_payable')),
      70000,
    );
    assert.deepEqual(full.statement, []);
    const worker = await financialEmployee(db);
    const grant = async (permissions: string[]) => {
      if (db.storage === 'padova')
        await db.query('UPDATE staff SET permissions=$2 WHERE id=$1', [worker.id, permissions]);
      return { ...worker, role: 'EMPLOYEE' as const, permissions };
    };
    assert.deepEqual(
      (await detail(db, await grant(['operations']), 'person', seller.id)).sourceStatement,
      [],
    );
    const costs = await detail(
      db,
      await grant(['operations', 'view_supplier_cost']),
      'person',
      seller.id,
    );
    assert.equal(balance(costs.sourceStatement), 40000);
    assert.ok(costs.sourceStatement.every((r: any) => r.account === 'supplier_payable'));
    const basis = await detail(
      db,
      await grant(['operations', 'view_asset_basis']),
      'person',
      seller.id,
    );
    assert.equal(balance(basis.sourceStatement), 70000);
    assert.ok(basis.sourceStatement.every((r: any) => r.account === 'asset_acquisition_payable'));
    assert.equal((await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n, rowsBefore);
  } finally {
    await db.close();
  }
});
