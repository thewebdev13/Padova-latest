import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute, economics, type CommandKind } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';
import { effectiveTravelComponents } from '../src/lib/fulfillment';
import type { Database, Row } from '../src/lib/db';
import { eligibleParty } from '../src/lib/directory-eligibility';
import {
  readBookingRecovery,
  writeBookingRecovery,
  clearBookingRecovery,
  shouldAutoOpenBookingRecovery,
  snoozeBookingRecoveryAutoOpen,
  isServerDraftRecovery,
  localBookingRecoveryOffer,
  bookingRecoveryContinueDefaults,
} from '../src/lib/booking-recovery';
let db: Database;
const date = '2026-11-02';
const run = (kind: CommandKind, data: unknown, key = randomUUID()) =>
  execute(db, testOwner, { id: key, kind, data });
before(async () => {
  db = await financialDatabase();
});
after(async () => {
  await db.close();
});
async function setup(cost: number | null = 30000) {
  const customer = await run('party', {
      name: 'Targeted customer ' + randomUUID(),
      kind: 'person',
      roles: ['customer', 'traveler'],
    }),
    seller = await run('party', {
      name: 'Targeted seller ' + randomUUID(),
      kind: 'company',
      roles: ['seller'],
    });
  const source = (
    await db.query("SELECT id FROM booking_source_methods WHERE name='Direct Airline'")
  ).rows[0];
  const booking = await run('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Direct Airline',
    summary: 'Targeted synthetic trip',
    booked_on: date,
    travel_start: '2026-11-05',
    travel_end: '2026-11-05',
    sale: 55000,
    travel_components_input: [
      {
        product: 'Flight',
        summary: 'Targeted synthetic trip',
        travel_start: '2026-11-05',
        travel_end: '2026-11-05',
        details: {
          route: 'OLD',
          summary_generated: true,
          reservation_summary_generated: true,
          reservation_summary: 'Original itinerary',
        },
      },
    ],
    operational: {
      version: 1,
      sale_known: true,
      source_method_id: source.id,
      components:
        cost == null
          ? []
          : [{ type: 'Outside seller', seller_id: seller.id, cost, unit: 'money', date }],
    },
  });
  return { customer, seller, booking };
}
test('automatic recovery is actor-scoped, retains exact retry identity and survives failed saves without persisting credentials', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  };
  const key = randomUUID();
  assert.equal(
    writeBookingRecovery(
      {
        version: 1,
        actorId: 'first',
        commandKey: key,
        savedAt: date,
        values: { customer_id: 'selected', primary_reference: 'PNR1, PNR2', sale: '550' },
        components: [{ type: 'Owned value', quantity: '200' }],
        traveler: 'Passenger name',
        paste: 'Password: hidden\nCard: 4111111111111111',
      },
      storage,
    ),
    true,
  );
  const recovered = readBookingRecovery('first', storage)!;
  assert.equal(recovered.commandKey, key);
  assert.equal(recovered.values.sale, '550');
  assert.equal(recovered.traveler, 'Passenger name');
  assert.ok(!recovered.paste.includes('4111111111111111'));
  assert.ok(!recovered.paste.includes('hidden'));
  assert.equal(readBookingRecovery('second', storage), null);
  // Plan v1: never auto-open unfinished booking on load (Drafts / explicit Continue only).
  assert.equal(shouldAutoOpenBookingRecovery('first', recovered, storage), false);
  snoozeBookingRecoveryAutoOpen('first', storage);
  assert.equal(shouldAutoOpenBookingRecovery('first', recovered, storage), false);
  clearBookingRecovery('first', storage);
  assert.equal(readBookingRecovery('first', storage), null);
  assert.equal(
    writeBookingRecovery(recovered, {
      ...storage,
      setItem: () => {
        throw Error('Unavailable');
      },
    }),
    false,
  );
});
test('server Continue Draft recovery does not auto-open on refresh', () => {
  const draft = {
    version: 1 as const,
    actorId: 'first',
    commandKey: randomUUID(),
    savedAt: date,
    values: { draft_id: 'draft-row-1', sale: '100' },
    components: [],
    traveler: '',
    paste: '',
  };
  assert.equal(isServerDraftRecovery(draft), true);
  assert.equal(shouldAutoOpenBookingRecovery('first', draft), false);
  assert.equal(
    shouldAutoOpenBookingRecovery('first', { ...draft, values: { sale: '100' } }),
    false,
  );
  // Server drafts: Drafts list only — no local Continue banner.
  assert.equal(localBookingRecoveryOffer('first', draft), null);
});

test('Plan Do-now: local unfinished offers Continue banner defaults (never auto-open)', () => {
  const key = randomUUID();
  const draft = {
    version: 1 as const,
    actorId: 'first',
    commandKey: key,
    savedAt: `${date}T12:00:00.000Z`,
    values: { sale: '550', customer_id: 'c1' },
    components: [{ type: 'Flight' }],
    traveler: 'Ada',
    paste: 'PNR ABC',
  };
  assert.equal(shouldAutoOpenBookingRecovery('first', draft), false);
  assert.deepEqual(localBookingRecoveryOffer('first', draft), {
    commandKey: key,
    savedAt: `${date}T12:00:00.000Z`,
    hasPaste: true,
  });
  assert.equal(localBookingRecoveryOffer('other', draft), null);
  const defaults = bookingRecoveryContinueDefaults(draft);
  assert.equal(defaults.resume_recovery, true);
  assert.equal(defaults.sale, '550');
  assert.equal(defaults.pending_traveler, 'Ada');
  assert.equal(defaults.recovery_paste, 'PNR ABC');
  assert.deepEqual(defaults.components, [{ type: 'Flight' }]);
});
test('booking change consistently projects dates, traveled state, travelers and references over the normal single trip while preserving its original row', async () => {
  const x = await setup();
  const original = (
    await db.query('SELECT * FROM travel_components WHERE booking_id=$1', [x.booking.id])
  ).rows[0];
  await run('revise', {
    booking_id: x.booking.id,
    summary: 'Corrected trip',
    travel_start: '2026-10-30',
    travel_end: '2026-10-30',
    reservation_status: 'Traveled',
    traveler_ids: [x.customer.id],
    confirmations: ['PNR-TWO'],
    itinerary: { ...(await economics(db, x.booking.id)).itinerary, route: 'NEW' },
    date,
    reason: 'Correct actual travel date',
  });
  const current = (await effectiveTravelComponents(db, x.booking.id))[0];
  await run('revise', {
    booking_id: x.booking.id,
    summary: 'Corrected trip',
    travel_start: '2026-10-30',
    travel_end: '2026-10-30',
    reservation_status: 'Traveled',
    itinerary: (await economics(db, x.booking.id)).itinerary,
    confirmations: [],
    date,
    reason: 'Later revision must retain earlier additional PNR',
  });
  const latest = (await effectiveTravelComponents(db, x.booking.id))[0];
  assert.ok(latest.details.confirmations.includes('PNR-TWO'));
  assert.equal(latest.details.reservation_summary, 'Corrected trip');
  assert.equal(current.travel_start, '2026-10-30');
  assert.equal(current.status, 'Traveled');
  assert.equal(current.details.route, 'NEW');
  assert.ok(current.details.traveler_ids.includes(x.customer.id));
  assert.ok(current.details.confirmations.includes('PNR-TWO'));
  assert.deepEqual(
    (await db.query('SELECT * FROM travel_components WHERE id=$1', [original.id])).rows[0],
    original,
  );
  assert.equal((await economics(db, x.booking.id)).travel_start, current.travel_start);
});
test('acknowledged customer debt remains economically open and a missing traveler is explicit', async () => {
  const x = await setup();
  let s = await snapshot(db, testOwner);
  const a = s.attention.find((a: Row) => a.key === `balance:${x.booking.id}`)!;
  assert.ok(a);
  await run('resolve_attention', {
    key: a.key,
    fingerprint: a.fingerprint,
    note: 'Reviewed; not paid',
  });
  s = await snapshot(db, testOwner);
  assert.ok(
    s.attention.some(
      (a: Row) => a.key === `balance:${x.booking.id}` && a.amount === 55000 && a.acknowledged,
    ),
  );
  assert.ok(s.attention.some((a: Row) => a.key === `traveler-missing:${x.booking.id}`));
  assert.ok(
    s.operationalViews['Customer Owes'].some(
      (r: Row) => r.booking_id === x.booking.id && r.amount === 55000,
    ),
  );
  await run('payment', {
    direction: 'customer',
    party_id: x.customer.id,
    amount: 20000,
    method: 'ACH',
    date,
    allocations: [{ booking_id: x.booking.id, amount: 20000 }],
  });
  assert.equal((await economics(db, x.booking.id)).customer_balance, 35000);
  const activity = (await detail(db, testOwner, 'booking', x.booking.id)).activity;
  assert.ok(
    activity.some(
      (a: Row) =>
        a.summary.includes('$200.00 ACH receipt') && a.summary.includes('$550.00 to $350.00'),
    ),
  );
  const employeeActivity = (await detail(db, await financialEmployee(db), 'booking', x.booking.id))
    .activity;
  const receipt = employeeActivity.find((a: Row) => a.kind === 'payment');
  assert.ok(receipt.summary.includes('$200.00'));
  assert.ok(!receipt.summary.includes('$550.00') && !receipt.summary.includes('$350.00'));
  assert.equal(receipt.after_value, undefined);
});
test('unknown basis can be registered, used without another catalog setup and restored as Unknown rather than zero', async () => {
  const x = await setup(null);
  const asset = await run('acquire_asset', {
    name: 'Unknown-basis voucher',
    kind: 'Voucher',
    issuer: 'Synthetic airline',
    ownership: 'Padova',
    quantity: 10000,
    cost: null,
    date,
  });
  let s = await snapshot(db, testOwner);
  assert.equal(s.assets.find((a: Row) => a.id === asset.id)!.remaining_basis, null);
  const trip = (await effectiveTravelComponents(db, x.booking.id))[0];
  const use = await run('fulfill', {
    booking_id: x.booking.id,
    travel_component_id: trip.id,
    mode: 'Owned inventory',
    asset_id: asset.id,
    unit: 'money',
    quantity: 2000,
    date,
  });
  assert.ok(use.id);
  assert.equal((await economics(db, x.booking.id)).profit, null);
  assert.equal(
    (await db.query('SELECT cost FROM funding_components WHERE id=$1', [use.funding_component_id]))
      .rows[0].cost,
    null,
  );
  const r = await run('cancel', {
    booking_id: x.booking.id,
    funding_component_id: use.funding_component_id,
    supplier_expected: 2000,
    customer_due: 0,
    charge_reduction: 55000,
    due_on: date,
    date,
    reason: 'Return unused unknown-basis value',
  });
  await run('receive_refund', { refund_id: r.id, amount: 2000, form: 'Voucher', date });
  s = await snapshot(db, testOwner);
  const returned = s.assets.find((a: Row) => a.id === asset.id)!;
  assert.equal(Number(returned.balance), 10000);
  assert.equal(returned.remaining_basis, null);
  assert.ok(s.attention.some((a: Row) => a.key === `asset-basis:${asset.id}`));
  assert.equal(
    Number((await db.query('SELECT sum(debit-credit) n FROM journal_lines')).rows[0].n),
    0,
  );
});
test('seller payout correction restores the exact obligation without adding cost and rejects duplicate replay', async () => {
  const x = await setup();
  const key = randomUUID();
  const p = await run('payment', {
    direction: 'supplier',
    party_id: x.seller.id,
    amount: 20000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: x.booking.id, amount: 20000 }],
  });
  const before = await economics(db, x.booking.id);
  const correction = {
    payment_id: p.id,
    amount: 5000,
    date,
    reason: 'Actual seller returned 150 dollars',
  };
  await run('correct_payment', correction, key);
  await run('correct_payment', correction, key);
  const current = await economics(db, x.booking.id);
  assert.equal(current.supplier_balance, 25000);
  assert.equal(current.funding_cost, before.funding_cost);
  assert.equal(
    (await db.query('SELECT amount FROM payments WHERE id=$1', [p.id])).rows[0].amount,
    20000,
  );
  const worker = await financialEmployee(db);
  await assert.rejects(
    execute(db, worker, {
      id: randomUUID(),
      kind: 'correct_payment',
      data: { ...correction, amount: 0 },
    }),
  );
});
test('existing providers can pay commission and provider-direct money never becomes Padova receivable', async () => {
  const x = await setup(null);
  assert.equal(eligibleParty({ kind: 'company', roles: ['property'] }, 'commission_payer'), true);
  for (const fee of [0, 5000]) {
    const b = await run('booking', {
      customer_id: x.customer.id,
      product: 'Other',
      channel: 'Direct Provider',
      summary: 'Provider-direct test',
      booked_on: date,
      travel_start: date,
      travel_end: date,
      sale: fee,
      travel_components_input: [
        {
          product: 'Other',
          summary: 'Provider-direct test',
          travel_start: date,
          travel_end: date,
          details: { description: 'Direct provider payment' },
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        other_description: 'Direct provider payment',
        components: [{ type: 'Customer card', owner_id: x.customer.id, cost: 80000, date }],
      },
    });
    const e = await economics(db, b.id);
    assert.equal(e.sale, fee, 'An explicitly known zero sale must remain zero');
    assert.equal(e.customer_balance, fee);
    assert.equal(e.profit, fee);
    assert.equal(e.funding_cost, 0);
    await run('referral', {
      booking_id: b.id,
      referrer_id: x.seller.id,
      basis: 'percentage',
      percentage_basis: 'sale',
      rate_bps: 1000,
      earned: true,
      payable_when: 'When earned',
      due_on: date,
      date,
      reason: 'Percentage of the explicitly known Padova fee, including zero',
    });
    const withPayable = await economics(db, b.id);
    assert.equal(withPayable.commission_payables[0].expected_due, fee / 10);
    assert.equal(withPayable.commission_payables[0].accrued, fee / 10);
  }
});
test('inline actual hotel commission uses the saved account without booking provider-direct money as receivable', async () => {
  const x = await setup(null);
  const hotel = await run('party', {
    name: 'Existing hotel commission payer',
    kind: 'company',
    roles: ['property'],
  });
  const bank = await run('payment_account', { name: 'Synthetic commission bank', kind: 'Bank' });
  const b = await run('booking', {
    customer_id: x.customer.id,
    product: 'Hotel',
    channel: 'Direct Provider',
    summary: 'Direct hotel with actual commission',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 0,
    travel_components_input: [
      {
        product: 'Hotel',
        provider_id: hotel.id,
        summary: 'Direct hotel',
        travel_start: date,
        travel_end: date,
        details: { hotel: 'Synthetic hotel' },
      },
    ],
    operational: {
      version: 1,
      sale_known: true,
      components: [{ type: 'Customer card', owner_id: x.customer.id, cost: 80000, date }],
      commission: {
        expected: 'Yes',
        payer_id: hotel.id,
        amount: 5000,
        received: 1000,
        received_on: date,
        method: 'ACH',
        account_id: bank.id,
        due_on: date,
      },
    },
  });
  const e = await economics(db, b.id);
  assert.equal(e.customer_balance, 0);
  assert.equal(e.current_profit, 1000);
  const receipt = (
    await db.query(
      'SELECT p.account_id,p.amount FROM payments p JOIN commission_allocations a ON a.payment_id=p.id JOIN commissions c ON c.id=a.commission_id WHERE c.booking_id=$1',
      [b.id],
    )
  ).rows[0];
  assert.equal(receipt.account_id, bank.id);
  assert.equal(Number(receipt.amount), 1000);
});

test('outside BP gross and net economics create only the actual seller cost and no Padova rebate or inventory', async () => {
  const x = await setup(null);
  const source = (
    await db.query(
      "SELECT id FROM booking_source_methods WHERE name='Amex Travel / Business Platinum'",
    )
  ).rows[0];
  const b = await run('booking', {
    customer_id: x.customer.id,
    product: 'Flight',
    channel: 'Amex Travel / Business Platinum',
    summary: 'Seller BP test',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 100000,
    travel_components_input: [
      {
        product: 'Flight',
        summary: 'Seller BP test',
        travel_start: date,
        travel_end: date,
        details: { route: 'JFK-LHR' },
      },
    ],
    operational: {
      version: 1,
      sale_known: true,
      source_method_id: source.id,
      other_description: 'Outside seller BP economics',
      components: [
        {
          type: 'Outside seller',
          seller_id: x.seller.id,
          supplied: 'Points / Miles',
          unit: 'points',
          quantity: 65000,
          bp_gross_points: 100000,
          bp_rebate_bps: 3500,
          quoted_rate: '1.30',
          rate_unit: 'cents per point',
          date,
        },
      ],
    },
  });
  const e = await economics(db, b.id);
  assert.equal(e.funding_cost, 84500);
  assert.equal(e.supplier_balance, 84500);
  assert.equal(e.profit, 15500);
  assert.equal(
    (await db.query('SELECT id FROM expected_events WHERE booking_id=$1', [b.id])).rows.length,
    0,
  );
  assert.equal(
    (await db.query('SELECT id FROM assets WHERE source_booking_id=$1', [b.id])).rows.length,
    0,
  );
});

test('a remaining flight inherits booking revisions while a previously canceled stay stays canceled', async () => {
  const x = await setup();
  const stay = await run('travel_component', {
    booking_id: x.booking.id,
    product: 'Other',
    summary: 'Side trip',
    travel_start: '2026-11-06',
    travel_end: '2026-11-06',
    details: { description: 'Optional side trip' },
    date,
  });
  await run('cancel', {
    booking_id: x.booking.id,
    travel_component_id: stay.id,
    supplier_expected: 0,
    customer_due: 0,
    charge_reduction: 0,
    date,
    due_on: date,
    reason: 'Cancel only the side trip',
  });
  await run('revise', {
    booking_id: x.booking.id,
    summary: 'Actual remaining flight',
    travel_start: '2026-10-30',
    travel_end: '2026-10-30',
    reservation_status: 'Traveled',
    itinerary: (await economics(db, x.booking.id)).itinerary,
    date,
    reason: 'Actual travel date',
  });
  const trips = await effectiveTravelComponents(db, x.booking.id);
  assert.equal(trips.find((t) => t.id === stay.id)?.status, 'Cancelled');
  assert.equal(trips.find((t) => t.id !== stay.id)?.travel_start, '2026-10-30');
  assert.equal(trips.find((t) => t.id !== stay.id)?.status, 'Traveled');
});

test('owned ancillary value inherits its catalog role without claiming to fund the main trip', async () => {
  const x = await setup(null);
  const program = await run('program', {
    name: 'Ancillary certificate program',
    category: 'Hotel',
  });
  const instrument = await run('instrument', {
    program_id: program.id,
    name: 'Upgrade certificate',
    unit: 'count',
    role: 'Ancillary',
  });
  const asset = await run('acquire_asset', {
    name: 'Owned upgrade',
    kind: 'Certificate',
    issuer: 'Synthetic',
    quantity: 1,
    cost: 1000,
    unit: 'count',
    instrument_id: instrument.id,
    date,
  });
  const t = (await effectiveTravelComponents(db, x.booking.id))[0];
  const use = await run('fulfill', {
    booking_id: x.booking.id,
    travel_component_id: t.id,
    asset_id: asset.id,
    mode: 'Owned inventory',
    unit: 'count',
    quantity: 1,
    date,
  });
  assert.equal(use.role, 'Ancillary');
  assert.equal((await economics(db, x.booking.id)).profit, null);
});

test('source profiles link neutral contacts and preserve ordinary full phone/WhatsApp values', async () => {
  const person = await run('party', {
    name: 'Neutral profile owner',
    kind: 'person',
    roles: [],
    phone: '+4412345678901',
    details: { whatsapp: '+972541234567' },
  });
  const source = (
    await db.query(
      "SELECT id FROM booking_source_methods WHERE name='Amex Travel / Business Platinum'",
    )
  ).rows[0];
  await run('booking_source_profile', {
    name: 'Neutral owned account',
    source_method_id: source.id,
    provider: 'Amex Travel',
    holder_id: person.id,
    notes: 'Contact by phone +4412345678901',
  });
  const stored = (
    await db.query('SELECT roles,phone,details FROM parties WHERE id=$1', [person.id])
  ).rows[0];
  assert.deepEqual(stored.roles, []);
  assert.equal(stored.phone, '+4412345678901');
  assert.equal(stored.details.whatsapp, '+972541234567');
});

test('a newly issued refund credit keeps an unknown original basis Unknown', async () => {
  const x = await setup(null);
  const a = await run('acquire_asset', {
    name: 'Unknown original voucher',
    kind: 'Voucher',
    issuer: 'Synthetic',
    quantity: 10000,
    cost: null,
    date,
  });
  const t = (await effectiveTravelComponents(db, x.booking.id))[0];
  const use = await run('fulfill', {
    booking_id: x.booking.id,
    travel_component_id: t.id,
    mode: 'Owned inventory',
    asset_id: a.id,
    unit: 'money',
    quantity: 2000,
    date,
  });
  const r = await run('cancel', {
    booking_id: x.booking.id,
    funding_component_id: use.funding_component_id,
    supplier_expected: 2000,
    customer_due: 0,
    charge_reduction: 55000,
    date,
    due_on: date,
    reason: 'Issuer returns a different credit',
  });
  const receipt = await run('receive_refund', {
    refund_id: r.id,
    amount: 2000,
    form: 'Voucher',
    new_asset: { name: 'Replacement unknown-basis voucher', issuer: 'Synthetic' },
    date,
  });
  assert.equal(
    (await db.query('SELECT remaining_basis FROM asset_balances WHERE id=$1', [receipt.asset_id]))
      .rows[0].remaining_basis,
    null,
  );
});
