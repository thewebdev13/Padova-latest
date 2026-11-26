import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execute, economics } from '../src/lib/finance';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { formatQuantity } from '../src/lib/fulfillment';
import { snapshot, detail } from '../src/lib/queries';
import type { Row } from '../src/lib/db';

async function setup(product = 'Flight') {
  const db = await financialDatabase();
  const run = (kind: any, data: any, command_id = randomUUID()) =>
    execute(db, testOwner, { id: command_id, kind, data });
  const customer = await run('party', {
    name: 'Synthetic traveler',
    kind: 'person',
    roles: ['customer', 'traveler', 'seller'],
  });
  const provider = await run('party', {
    name: 'Synthetic airline / hotel',
    kind: 'supplier',
    roles: ['seller', 'airline', 'property', 'rental'],
  });
  const broker = await run('party', {
    name: 'Synthetic outside award source',
    kind: 'partner',
    roles: ['seller'],
  });
  const program = await run('program', {
    name: 'Synthetic configurable program',
    category: 'Airline',
    provider_id: provider.id,
  });
  const points = await run('instrument', {
    program_id: program.id,
    name: 'Award redemption units',
    unit: 'points',
    role: 'Both',
  });
  const certificate = await run('instrument', {
    program_id: program.id,
    name: 'Free night certificate',
    unit: 'count',
    role: 'Both',
  });
  const booking = await run('booking', {
    customer_id: customer.id,
    supplier_id: provider.id,
    product: 'Flight + Hotel',
    channel: 'Another Agency',
    summary: 'Synthetic composable trip',
    booked_on: '2026-10-29',
    travel_start: '2026-12-01',
    travel_end: '2026-12-03',
    sale: 130000,
  });
  const travel = await run('travel_component', {
    booking_id: booking.id,
    product,
    summary: 'Synthetic outside award flight',
    provider_id: provider.id,
    channel: 'Another Agency',
    acquisition_source_id: broker.id,
    travel_start: '2026-12-01',
    travel_end: '2026-12-03',
  });
  return { db, run, customer, provider, broker, program, points, certificate, booking, travel };
}

test('single-save booking creates linked travel and mixed funding atomically, with original basis and no historical payload leak', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Single-save voucher',
      kind: 'Voucher',
      issuer: 'Synthetic',
      quantity: 10000,
      cost: 8000,
      date: '2026-10-29',
    });
    const data = {
      customer_id: f.customer.id,
      supplier_id: f.provider.id,
      product: 'Flight',
      channel: 'Direct Airline',
      summary: 'Single-save mixed booking',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 20000,
      create_initial_travel: true,
      confirmations: ['ONE-SAVE-PNR'],
      itinerary: {
        cost_status: 'Confirmed',
        origin: 'JFK',
        destination: 'ORD',
        historical_sources: [{ original_fields: { private_source: 'OWNER EVIDENCE' } }],
      },
      funding: [
        { kind: 'Voucher', asset_id: asset.id, face_amount: 5000, date: '2026-10-29' },
        { kind: 'Card', face_amount: 6000, cost: 6000, date: '2026-10-29' },
      ],
    };
    const key = randomUUID(),
      booking = await f.run('booking', data, key);
    assert.equal((await f.run('booking', data, key)).id, booking.id);
    const travel = (
      await f.db.query('SELECT * FROM travel_components WHERE booking_id=$1', [booking.id])
    ).rows;
    assert.equal(travel.length, 1);
    assert.equal(travel[0].details.origin, 'JFK');
    assert.deepEqual(travel[0].details.confirmations, ['ONE-SAVE-PNR']);
    assert.equal(travel[0].details.historical_sources, undefined);
    const fulfilled = (
      await f.db.query('SELECT * FROM fulfillment_details WHERE booking_id=$1', [booking.id])
    ).rows;
    assert.equal(fulfilled.length, 2);
    assert.ok(fulfilled.every((x) => x.travel_component_id === travel[0].id));
    assert.deepEqual(fulfilled.map((x) => x.mode).sort(), ['Cash/Card', 'Owned inventory']);
    const e = await economics(f.db, booking.id);
    assert.equal(e.cost_incomplete, false);
    assert.equal(Number(e.funding_cost), 10000);
    assert.equal(Number(e.profit), 10000);
    assert.equal(Number(e.supplier_balance), 6000);
    assert.equal(Number(e.customer_balance), 20000);
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [asset.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 5000);
    assert.equal(Number(balance.remaining_basis), 4000);
    const version = (
      await f.db.query('SELECT * FROM itinerary_revisions WHERE booking_id=$1', [booking.id])
    ).rows[0];
    assert.equal(version.snapshot.travel_components[0].id, travel[0].id);
    await f.run('revise', {
      booking_id: booking.id,
      summary: 'Revised single-save flight',
      travel_start: '2026-12-05',
      travel_end: '2026-12-06',
      confirmations: ['REVISED-PNR'],
      date: '2026-10-30',
      reason: 'Synthetic date correction',
      itinerary: { cost_status: 'Confirmed', origin: 'JFK', destination: 'BOS' },
    });
    const revisedState = await snapshot(f.db, testOwner);
    const currentTravel = revisedState.travelComponents.find((t) => t.id === travel[0].id)!;
    assert.equal(currentTravel.travel_start, '2026-12-05');
    assert.equal(currentTravel.details.destination, 'BOS');
    assert.ok(currentTravel.details.confirmations.includes('REVISED-PNR'));
    const originalTravel = (
      await f.db.query('SELECT * FROM travel_components WHERE id=$1', [travel[0].id])
    ).rows[0];
    assert.equal(originalTravel.travel_start, '2026-12-01');
    assert.equal(originalTravel.details.destination, 'ORD');
    const revisedVersion = (
      await f.db.query(
        'SELECT * FROM itinerary_revisions WHERE booking_id=$1 ORDER BY revision DESC',
        [booking.id],
      )
    ).rows[0];
    assert.equal(revisedVersion.snapshot.travel_components[0].travel_start, '2026-12-05');
    const counts = (await f.db.query('SELECT count(*) count FROM bookings')).rows[0].count;
    await assert.rejects(
      f.run('booking', { ...data, funding: [{ ...data.funding[0], face_amount: 6000 }] }),
      /Insufficient/,
    );
    assert.equal((await f.db.query('SELECT count(*) count FROM bookings')).rows[0].count, counts);
  } finally {
    await f.db.close();
  }
});

test('single-save operational travel keeps cost pending until funded, and explicit no-cost requires financial permission', async () => {
  const f = await setup();
  try {
    const data = {
      customer_id: f.customer.id,
      product: 'Hotel',
      channel: 'Unknown',
      summary: 'Single-save pending hotel',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      create_initial_travel: true,
    };
    const pending = await f.run('booking', data);
    assert.equal((await economics(f.db, pending.id)).profit, null);
    const free = await f.run('booking', {
      ...data,
      sale: 10000,
      itinerary: { cost_status: 'No supplier cost' },
    });
    assert.equal(Number((await economics(f.db, free.id)).profit), 10000);
    const employee = await financialEmployee(f.db);
    await assert.rejects(
      execute(f.db, employee, {
        id: randomUUID(),
        kind: 'booking',
        data: { ...data, itinerary: { cost_status: 'No supplier cost' } },
      }),
      /manage_funding/,
    );
  } finally {
    await f.db.close();
  }
});

test('unknown outside-source identity is preserved without borrowing a direct provider as the payee', async () => {
  const f = await setup();
  try {
    const data = {
      customer_id: f.customer.id,
      supplier_id: f.provider.id,
      product: 'Flight',
      channel: 'Direct Airline',
      summary: 'Source identity still unknown',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      create_initial_travel: true,
      itinerary: { acquisition_source_status: 'Unknown' },
    };
    const booking = await f.run('booking', data);
    assert.equal(
      (await economics(f.db, booking.id)).itinerary.acquisition_source_status,
      'Unknown',
    );
    await assert.rejects(
      f.run('fund', {
        booking_id: booking.id,
        kind: 'Card',
        face_amount: 10000,
        date: '2026-10-29',
      }),
      /actual supplier\/payee/,
    );
    assert.equal(
      Number(
        (
          await f.db.query('SELECT count(*) count FROM supplier_obligations WHERE booking_id=$1', [
            booking.id,
          ])
        ).rows[0].count,
      ),
      0,
    );
    await assert.rejects(
      f.run('booking', {
        ...data,
        itinerary: {
          acquisition_source_status: 'Unknown',
          acquisition_source_id: f.broker.id,
        },
      }),
      /cannot also name/,
    );
  } finally {
    await f.db.close();
  }
});

test('single-save ancillary certificate retains its catalog role without treating the underlying stay as funded', async () => {
  const f = await setup();
  try {
    const instrument = await f.run('instrument', {
      program_id: f.program.id,
      name: 'Ancillary upgrade only',
      unit: 'count',
      role: 'Ancillary',
    });
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic upgrade benefit',
      kind: 'Upgrade',
      issuer: 'Synthetic',
      instrument_id: instrument.id,
      unit: 'count',
      quantity: 1,
      cost: 3000,
      date: '2026-10-29',
    });
    const booking = await f.run('booking', {
      customer_id: f.customer.id,
      product: 'Hotel',
      channel: 'Direct Hotel',
      summary: 'Base stay not yet funded',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 50000,
      create_initial_travel: true,
      itinerary: { cost_status: 'Confirmed' },
      funding: [
        { kind: 'Upgrade', asset_id: asset.id, unit: 'count', face_amount: 1, date: '2026-10-29' },
      ],
    });
    const fulfillment = (
      await f.db.query('SELECT * FROM fulfillment_details WHERE booking_id=$1', [booking.id])
    ).rows[0];
    assert.equal(fulfillment.role, 'Ancillary');
    assert.equal(fulfillment.terms.cost_complete, false);
    assert.equal((await economics(f.db, booking.id)).profit, null);
    assert.equal(Number((await economics(f.db, booking.id)).funding_cost), 3000);
  } finally {
    await f.db.close();
  }
});

test('one save creates flight and hotel with exact funding assignments, independent payees and no duplicate inventory or payments', async () => {
  const f = await setup();
  try {
    const certificate = await f.run('acquire_asset', {
      name: 'Mixed-trip two certificates',
      kind: 'Free night',
      issuer: 'Synthetic',
      instrument_id: f.certificate.id,
      unit: 'count',
      quantity: 2,
      cost: 30000,
      date: '2026-10-29',
    });
    const data = {
      customer_id: f.customer.id,
      product: 'Flight + Hotel',
      channel: 'Another Agency',
      summary: 'One-save flight and hotel',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 130000,
      itinerary: { cost_status: 'Confirmed' },
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Outside award flight',
          provider_id: f.provider.id,
          acquisition_source_id: f.broker.id,
          channel: 'Another Agency',
          travel_start: '2026-12-01',
          travel_end: '2026-12-01',
          details: { confirmations: ['MULTI-FLIGHT'] },
        },
        {
          product: 'Hotel',
          summary: 'Certificate hotel',
          provider_id: f.provider.id,
          channel: 'Direct Hotel',
          travel_start: '2026-12-05',
          travel_end: '2026-12-07',
          details: { confirmations: ['MULTI-HOTEL'] },
        },
      ],
      funding: [
        {
          travel_index: 0,
          kind: 'Seller-funded reservation',
          face_amount: 85000,
          cost: 85000,
          date: '2026-10-29',
        },
        { travel_index: 0, kind: 'Card', face_amount: 8200, cost: 8200, date: '2026-10-29' },
        {
          travel_index: 1,
          kind: 'Free night',
          asset_id: certificate.id,
          unit: 'count',
          face_amount: 1,
          date: '2026-10-29',
        },
      ],
    };
    const key = randomUUID(),
      booking = await f.run('booking', data, key);
    assert.equal((await f.run('booking', data, key)).id, booking.id);
    const state = await snapshot(f.db, testOwner),
      travels = state.travelComponents.filter((t) => t.booking_id === booking.id);
    assert.equal(travels.length, 2);
    assert.equal(travels.find((t) => t.product === 'Hotel')?.travel_end, '2026-12-07');
    const e = await economics(f.db, booking.id);
    assert.equal(e.travel_end, '2026-12-07');
    assert.equal(Number(e.funding_cost), 108200);
    assert.equal(Number(e.profit), 21800);
    assert.equal(Number(e.customer_balance), 130000);
    assert.equal(Number(e.supplier_balance), 93200);
    const links = (
      await f.db.query('SELECT * FROM fulfillment_details WHERE booking_id=$1', [booking.id])
    ).rows;
    assert.equal(
      links.filter((x) => x.travel_component_id === travels.find((t) => t.product === 'Flight')?.id)
        .length,
      2,
    );
    assert.equal(links.find((x) => x.unit === 'count')?.instrument_id, f.certificate.id);
    const obligations = (
      await f.db.query('SELECT * FROM supplier_obligations WHERE booking_id=$1', [booking.id])
    ).rows;
    assert.ok(obligations.every((x) => x.supplier_id === f.broker.id));
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [certificate.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 1);
    assert.equal(Number(balance.remaining_basis), 15000);
    const count = (await f.db.query('SELECT count(*) count FROM bookings')).rows[0].count;
    await assert.rejects(
      f.run('booking', { ...data, create_initial_travel: true }),
      /either one initial travel/,
    );
    await assert.rejects(
      f.run('booking', { ...data, funding: [{ ...data.funding[0], travel_index: undefined }] }),
      /Choose the travel component/,
    );
    assert.equal((await f.db.query('SELECT count(*) count FROM bookings')).rows[0].count, count);
    const partial = await f.run('booking', { ...data, funding: data.funding.slice(0, 2) });
    assert.equal((await economics(f.db, partial.id)).profit, null);
  } finally {
    await f.db.close();
  }
});
test('outside-source award creates the actual source payable without owned inventory or source-internal rebate profit', async () => {
  const f = await setup();
  try {
    const data = {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      source_id: f.broker.id,
      mode: 'Outside source',
      unit: 'points',
      quantity: 70000,
      cost: 85000,
      date: '2026-10-29',
      confirm_cost: false,
      terms: { rebate_bps: 3500, rebate_scope: 'Outside source' },
    };
    const key = randomUUID();
    const result = await f.run('fulfill', data, key);
    assert.equal((await f.run('fulfill', data, key)).id, result.id);
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      source_id: f.broker.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 8200,
      cost: 8200,
      date: '2026-10-29',
    });
    const economicsResult = await economics(f.db, f.booking.id);
    assert.equal(Number(economicsResult.funding_cost), 93200);
    assert.equal(Number(economicsResult.profit), 36800);
    assert.equal(Number(economicsResult.supplier_balance), 93200);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM assets')).rows[0].n), 0);
    assert.equal(Number((await f.db.query('SELECT count(*) n FROM asset_lots')).rows[0].n), 0);
    const obligations = (await f.db.query('SELECT * FROM supplier_obligations')).rows;
    assert.ok(obligations.every((r) => r.supplier_id === f.broker.id));
    const funding = (await f.db.query('SELECT * FROM funding_components ORDER BY face_amount DESC'))
      .rows;
    assert.equal(Number(funding[0].face_amount), 70000);
    assert.equal(funding[0].unit, 'points');
    assert.equal(
      Number(
        (await f.db.query("SELECT count(*) n FROM profit_movements WHERE kind='earned_credit'"))
          .rows[0].n,
      ),
      0,
    );
  } finally {
    await f.db.close();
  }
});
test('count certificates can fund core travel or add an ancillary benefit with exact consumed basis', async () => {
  const f = await setup('Hotel');
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic 2 free nights',
      kind: 'Free night certificate',
      issuer: 'Synthetic hotel',
      instrument_id: f.certificate.id,
      unit: 'count',
      quantity: 2,
      cost: 30000,
      date: '2026-10-29',
    });
    const hotel = f.travel;
    for (const role of ['Core', 'Ancillary'])
      await f.run('fulfill', {
        booking_id: f.booking.id,
        travel_component_id: hotel.id,
        instrument_id: f.certificate.id,
        asset_id: asset.id,
        mode: 'Owned inventory',
        role,
        unit: 'count',
        quantity: 1,
        date: '2026-10-29',
      });
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [asset.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 0);
    assert.equal(Number(balance.remaining_basis), 0);
    const components = (await f.db.query('SELECT * FROM funding_components')).rows;
    assert.deepEqual(
      components.map((r) => Number(r.face_amount)),
      [1, 1],
    );
    assert.deepEqual(
      components.map((r) => Number(r.cost)),
      [15000, 15000],
    );
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 100000);
    assert.equal(
      Number((await f.db.query('SELECT count(*) n FROM supplier_obligations')).rows[0].n),
      0,
    );
    assert.equal(formatQuantity(1, 'count'), '1 certificate');
    assert.equal(formatQuantity(2, 'count'), '2 certificates');
    assert.equal(formatQuantity(1, 'points'), '1 point');
    assert.equal(formatQuantity(100, 'points'), '100 points');
  } finally {
    await f.db.close();
  }
});
test('fulfillment rejects mismatched unit, cross-booking components, implicit indirect payees and employee writes atomically', async () => {
  const f = await setup();
  try {
    const common = {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      source_id: f.broker.id,
      mode: 'Outside source',
      unit: 'points',
      quantity: 70000,
      cost: 85000,
      date: '2026-10-29',
    };
    await assert.rejects(f.run('fulfill', { ...common, unit: 'money' }), /unit/);
    const noSource = await f.run('travel_component', {
      booking_id: f.booking.id,
      product: 'Flight',
      summary: 'Unknown acquisition',
      provider_id: f.provider.id,
      channel: 'Capital One',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
    });
    await assert.rejects(
      f.run('fulfill', {
        booking_id: f.booking.id,
        travel_component_id: noSource.id,
        mode: 'Cash/Card',
        unit: 'money',
        quantity: 10000,
        cost: 10000,
        date: '2026-10-29',
      }),
      /actual payee/,
    );
    const other = await f.run('booking', {
      customer_id: f.customer.id,
      product: 'Hotel',
      channel: 'Other',
      summary: 'Other trip',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
    });
    await assert.rejects(f.run('fulfill', { ...common, booking_id: other.id }), /not found/i);
    const worker = await financialEmployee(f.db);
    await assert.rejects(
      execute(f.db, worker, { id: randomUUID(), kind: 'fulfill', data: common }),
      /manage_funding/,
    );
    const catalog = await execute(f.db, worker, {
      id: randomUUID(),
      kind: 'program',
      data: { name: 'Operational loyalty program', category: 'Other' },
    });
    assert.ok(
      catalog.id,
      'Staff may add a reusable program label inline without posting financial value',
    );
    await assert.rejects(
      execute(f.db, worker, {
        id: randomUUID(),
        kind: 'instrument',
        data: {
          program_id: catalog.id,
          name: 'Restricted instrument rules',
          unit: 'money',
          role: 'Core',
        },
      }),
      /manage_settings/,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) n FROM funding_components')).rows[0].n),
      0,
    );
  } finally {
    await f.db.close();
  }
});
test('requested and pending points transfer has no inventory movement; completion preserves basis with configured bonus and actual fee', async () => {
  const f = await setup();
  try {
    const source = await f.run('acquire_asset', {
      name: 'Synthetic bank points',
      kind: 'Bank rewards',
      unit: 'points',
      instrument_id: f.points.id,
      issuer: 'Bank',
      quantity: 100000,
      cost: 100000,
      date: '2026-10-29',
    });
    const target = await f.run('acquire_asset', {
      name: 'Synthetic airline points',
      kind: 'Airline rewards',
      unit: 'points',
      instrument_id: f.points.id,
      issuer: 'Airline',
      quantity: 1,
      cost: 1,
      date: '2026-10-29',
    });
    const event = await f.run('expected_event', {
      kind: 'Points transfer',
      source_asset_id: source.id,
      target_asset_id: target.id,
      quantity_sent: 100000,
      quantity_expected: 125000,
      date: '2026-10-29',
      terms: { ratio_numerator: 1, ratio_denominator: 1, bonus_bps: 2500, fees: 1000 },
    });
    await f.run('update_expected_event', {
      event_id: event.id,
      status: 'Pending',
      date: '2026-10-29',
      reason: 'Issuer transfer requested',
    });
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [source.id])).rows[0]
          .balance,
      ),
      100000,
    );
    const command_id = randomUUID();
    const data = {
      event_id: event.id,
      status: 'Posted',
      quantity_actual: 125000,
      date: '2026-10-30',
      reason: 'Actual points received and fee verified',
    };
    await f.run('update_expected_event', data, command_id);
    await f.run('update_expected_event', data, command_id);
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [target.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 125001);
    assert.equal(Number(balance.remaining_basis), 101001);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM asset_transfers')).rows[0].count),
      1,
    );
    await assert.rejects(f.run('update_expected_event', data), /already been posted/);
  } finally {
    await f.db.close();
  }
});
test('owned-points rebate posts only actual returned basis, reverses safely and never awards outside-source internal benefits', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic Amex balance',
      kind: 'Membership Rewards',
      unit: 'points',
      instrument_id: f.points.id,
      issuer: 'Bank',
      quantity: 100000,
      cost: 100000,
      date: '2026-10-29',
    });
    const fulfillment = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      asset_id: asset.id,
      mode: 'Owned inventory',
      unit: 'points',
      quantity: 100000,
      date: '2026-10-29',
    });
    const event = await f.run('expected_event', {
      kind: 'Points rebate',
      funding_component_id: fulfillment.funding_component_id,
      quantity_expected: 35000,
      date: '2026-10-29',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 30000);
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      0,
    );
    await f.run('update_expected_event', {
      event_id: event.id,
      status: 'Posted',
      quantity_actual: 35000,
      date: '2026-10-30',
      reason: 'Verified actual 35% issuer rebate',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 65000);
    assert.equal(
      Number(
        (await f.db.query('SELECT remaining_basis FROM asset_balances WHERE id=$1', [asset.id]))
          .rows[0].remaining_basis,
      ),
      35000,
    );
    await f.run('update_expected_event', {
      event_id: event.id,
      status: 'Reversed',
      date: '2026-10-31',
      reason: 'Issuer reversed available rebate',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 30000);
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      0,
    );
    await assert.rejects(
      f.run('update_expected_event', {
        event_id: event.id,
        status: 'Posted',
        quantity_actual: 35000,
        date: '2026-11-01',
        reason: 'Duplicate',
      }),
      /closed/,
    );
  } finally {
    await f.db.close();
  }
});
test('separate owned assets used in one booking command return only the selected component lots', async () => {
  const f = await setup();
  try {
    const assets: Row[] = [];
    for (const [name, cost] of [
      ['First owned points', 10000],
      ['Second owned points', 20000],
    ] as const)
      assets.push(
        await f.run('acquire_asset', {
          name,
          kind: 'Reward units',
          unit: 'points',
          instrument_id: f.points.id,
          issuer: 'Synthetic',
          quantity: 10000,
          cost,
          date: '2026-10-29',
        }),
      );
    const booking = await f.run('booking', {
      customer_id: f.customer.id,
      product: 'Flight',
      channel: 'Award Program',
      summary: 'Two separate owned lots',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 50000,
      funding: assets.map((a) => ({
        asset_id: a.id,
        kind: 'Reward units',
        unit: 'points',
        face_amount: 10000,
        date: '2026-10-29',
      })),
    });
    const components = (
      await f.db.query('SELECT * FROM funding_components WHERE booking_id=$1', [booking.id])
    ).rows;
    const second = components.find((c) => c.asset_id === assets[1].id)!;
    const refund = await f.run('cancel', {
      booking_id: booking.id,
      funding_component_id: second.id,
      supplier_expected: 10000,
      customer_due: 0,
      charge_reduction: 0,
      date: '2026-10-30',
      due_on: '2026-11-01',
      reason: 'Only second source returned',
    });
    await f.run('receive_refund', {
      refund_id: refund.id,
      amount: 10000,
      form: 'points',
      date: '2026-10-31',
    });
    const balances = (
      await f.db.query('SELECT * FROM asset_balances WHERE id IN ($1,$2) ORDER BY name', [
        assets[0].id,
        assets[1].id,
      ])
    ).rows;
    assert.equal(Number(balances.find((a) => a.id === assets[0].id)!.balance), 0);
    assert.equal(Number(balances.find((a) => a.id === assets[1].id)!.balance), 10000);
    assert.equal(Number(balances.find((a) => a.id === assets[1].id)!.remaining_basis), 20000);
    assert.equal(Number((await economics(f.db, booking.id)).generated_value), 20000);
  } finally {
    await f.db.close();
  }
});
test('count-based certificate return preserves quantity and original basis without inventing cash', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic upgrade certificate',
      kind: 'Suite upgrade',
      unit: 'count',
      instrument_id: f.certificate.id,
      issuer: 'Hotel',
      quantity: 1,
      cost: 9000,
      date: '2026-10-29',
    });
    const fulfillment = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.certificate.id,
      asset_id: asset.id,
      mode: 'Owned inventory',
      role: 'Ancillary',
      unit: 'count',
      quantity: 1,
      date: '2026-10-29',
    });
    const refund = await f.run('cancel', {
      booking_id: f.booking.id,
      funding_component_id: fulfillment.funding_component_id,
      supplier_expected: 1,
      customer_due: 0,
      charge_reduction: 0,
      date: '2026-10-30',
      due_on: '2026-11-01',
      reason: 'Actual certificate redeposited',
    });
    assert.equal(refund.quantity_unit, 'count');
    await assert.rejects(
      f.run('receive_refund', {
        refund_id: refund.id,
        amount: 1,
        form: 'cash',
        date: '2026-10-31',
      }),
      /noncash/,
    );
    await f.run('receive_refund', {
      refund_id: refund.id,
      amount: 1,
      form: 'Certificate',
      date: '2026-10-31',
    });
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [asset.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 1);
    assert.equal(Number(balance.remaining_basis), 9000);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    assert.equal(
      (await snapshot(f.db, testOwner)).refunds.find((r) => r.id === refund.id)?.unit,
      'count',
    );
  } finally {
    await f.db.close();
  }
});
test('Employee sees travel components but receives no fulfillment costs, expected rewards or instrument financial rules', async () => {
  const f = await setup();
  try {
    const worker = await financialEmployee(f.db);
    const data = await snapshot(f.db, worker);
    assert.equal(data.historicalPreparation, null);
    await assert.rejects(
      detail(f.db, worker, 'historical', randomUUID()),
      /Owner permission required/,
    );
    assert.equal(data.travelComponents.length, 1);
    assert.equal(data.expectedEvents.length, 0);
    assert.equal(data.programAccounts.length, 0);
    assert.equal('rules' in data.instruments[0], false);
    const bookingDetail = await detail(f.db, worker, 'booking', f.booking.id);
    assert.equal(bookingDetail.travelComponents?.length, 1);
    assert.deepEqual(bookingDetail.fulfillments, []);
    assert.equal(formatQuantity(-12345, 'cents'), '-$123.45');
  } finally {
    await f.db.close();
  }
});
test('new unfulfilled travel defers profit; linking existing funding restores it without duplicate cost or settlement', async () => {
  const f = await setup();
  try {
    const recorded = await f.run('fund', {
      booking_id: f.booking.id,
      kind: 'Card',
      face_amount: 80000,
      cost: 80000,
      seller_id: f.provider.id,
      date: '2026-10-29',
    });
    assert.equal((await economics(f.db, f.booking.id)).profit, null);
    const counts = async () =>
      Number((await f.db.query('SELECT count(*) count FROM funding_components')).rows[0].count);
    const key = randomUUID();
    const input = {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      funding_component_id: recorded.id,
      date: '2026-10-29',
      reason: 'Link already posted original funding to this travel',
    };
    await f.run('link_fulfillment', input, key);
    await f.run('link_fulfillment', input, key);
    assert.equal(await counts(), 1);
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 50000);
    const hotel = await f.run('travel_component', {
      booking_id: f.booking.id,
      product: 'Hotel',
      summary: 'Additional confirmed free benefit',
      channel: 'Direct Hotel',
      travel_start: '2026-12-01',
      travel_end: '2026-12-03',
    });
    assert.equal((await economics(f.db, f.booking.id)).profit, null);
    assert.equal(
      Number(
        (
          await f.db.query('SELECT sum(amount) amount FROM profit_movements WHERE booking_id=$1', [
            f.booking.id,
          ])
        ).rows[0].amount,
      ),
      0,
    );
    await f.run('confirm_travel_no_cost', {
      booking_id: f.booking.id,
      travel_component_id: hotel.id,
      date: '2026-10-29',
      reason: 'Explicit verified complimentary hotel benefit; no Padova expense',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 50000);
    assert.equal(await counts(), 1);
    await assert.rejects(
      f.run('confirm_travel_no_cost', {
        booking_id: f.booking.id,
        travel_component_id: f.travel.id,
        date: '2026-10-29',
        reason: 'Cannot overwrite paid cost',
      }),
      /already has a recorded cost/,
    );
  } finally {
    await f.db.close();
  }
});
test('portal redemption preserves actual price/rate evidence and original basis without inventing reference-price profit', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic Chase reward lot',
      kind: 'Ultimate Rewards',
      unit: 'points',
      instrument_id: f.points.id,
      issuer: 'Bank',
      quantity: 20000,
      cost: 20000,
      date: '2026-10-29',
    });
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      asset_id: asset.id,
      mode: 'Owned inventory',
      unit: 'points',
      quantity: 20000,
      date: '2026-10-29',
      terms: {
        portal_price: 30000,
        reference_price: 40000,
        rate_cents_numerator: 30000,
        rate_points_denominator: 20000,
      },
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 20000);
    assert.equal(Number((await economics(f.db, f.booking.id)).generated_value), 0);
    const terms = (await f.db.query('SELECT terms FROM fulfillment_details')).rows[0].terms;
    assert.equal(terms.rate_cents_numerator, 30000);
    assert.equal(terms.rate_points_denominator, 20000);
    await assert.rejects(
      f.run('fulfill', {
        booking_id: f.booking.id,
        travel_component_id: f.travel.id,
        mode: 'Cash/Card',
        unit: 'money',
        quantity: 5000,
        cost: 5000,
        date: '2026-10-29',
        source_id: f.broker.id,
        settled: true,
      }),
      /actual source payment method/,
    );
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Cash/Card',
      cash_method: 'Bank',
      unit: 'money',
      quantity: 5000,
      cost: 5000,
      date: '2026-10-29',
      source_id: f.broker.id,
      settled: true,
      payment_method: 'ACH',
    });
    const payment = (await f.db.query('SELECT * FROM payments')).rows[0];
    assert.equal(payment.method, 'ACH');
    assert.equal(payment.party_id, f.broker.id);
    assert.equal(Number(payment.amount), 5000);
  } finally {
    await f.db.close();
  }
});
test('actual spent-rebate reversal preserves history and creates a visible negative rewards position without fictional cash', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic gross redemption',
      kind: 'Membership Rewards',
      unit: 'points',
      instrument_id: f.points.id,
      issuer: 'Bank',
      quantity: 100000,
      cost: 100000,
      date: '2026-10-29',
    });
    const fulfillment = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      asset_id: asset.id,
      mode: 'Owned inventory',
      unit: 'points',
      quantity: 100000,
      date: '2026-10-29',
    });
    const event = await f.run('expected_event', {
      kind: 'Points rebate',
      funding_component_id: fulfillment.funding_component_id,
      quantity_expected: 35000,
      date: '2026-10-29',
    });
    await f.run('update_expected_event', {
      event_id: event.id,
      status: 'Posted',
      quantity_actual: 35000,
      date: '2026-10-30',
      reason: 'Actual rebate posted',
    });
    const other = await f.run('booking', {
      customer_id: f.customer.id,
      product: 'Flight',
      channel: 'Award Program',
      summary: 'Synthetic reuse of returned points',
      sale: 50000,
      booked_on: '2026-10-30',
      travel_start: '2026-12-10',
      travel_end: '2026-12-11',
    });
    await f.run('fund', {
      booking_id: other.id,
      kind: 'Membership Rewards',
      unit: 'points',
      asset_id: asset.id,
      face_amount: 35000,
      date: '2026-10-30',
    });
    const otherBefore = await economics(f.db, other.id);
    const reward = (
      await f.db.query("SELECT * FROM asset_movements WHERE asset_id=$1 AND kind='points_rebate'", [
        asset.id,
      ])
    ).rows[0];
    await f.run('update_expected_event', {
      event_id: event.id,
      status: 'Reversed',
      date: '2026-10-31',
      reason: 'Issuer reversal after use',
    });
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      -35000,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    assert.equal(
      (
        await f.db.query(
          'SELECT status FROM expected_event_updates WHERE event_id=$1 ORDER BY created_at DESC LIMIT 1',
          [event.id],
        )
      ).rows[0].status,
      'Reversed',
    );
    assert.equal(Number((await economics(f.db, other.id)).profit), Number(otherBefore.profit));
    assert.equal(
      Number(
        (await f.db.query('SELECT quantity FROM asset_movements WHERE id=$1', [reward.id])).rows[0]
          .quantity,
      ),
      35000,
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT original_movement_id FROM asset_movements WHERE asset_id=$1 AND kind='points_rebate_reversal'",
          [asset.id],
        )
      ).rows[0].original_movement_id,
      reward.id,
    );
    const deficit = (await snapshot(f.db, testOwner)).attention.find(
      (a) => a.key === `negative-inventory:${asset.id}`,
    )!;
    assert.ok(deficit);
    await assert.rejects(
      f.run('resolve_attention', {
        key: deficit.key,
        fingerprint: deficit.fingerprint,
        note: 'Not yet resolved',
      }),
      /remains negative/,
    );
  } finally {
    await f.db.close();
  }
});
test('component travel dates and confirmations feed booking search/calendar with immutable, retry-safe itinerary history', async () => {
  const f = await setup();
  try {
    const before = (await f.db.query('SELECT * FROM bookings WHERE id=$1', [f.booking.id])).rows[0];
    const key = randomUUID();
    const input = {
      booking_id: f.booking.id,
      product: 'Hotel',
      summary: 'Extended synthetic hotel',
      provider_id: f.provider.id,
      channel: 'Direct Hotel',
      travel_start: '2026-11-30',
      travel_end: '2026-12-07',
      details: { confirmations: ['EXACT-PNR', 'EXACT-PNR', 'HOTEL-REF'] },
    };
    await f.run('travel_component', input, key);
    await f.run('travel_component', input, key);
    const current = (await f.db.query('SELECT * FROM bookings WHERE id=$1', [f.booking.id]))
      .rows[0];
    assert.equal(current.travel_start, '2026-11-30');
    assert.equal(current.travel_end, '2026-12-07');
    assert.equal(Number(current.revision), Number(before.revision) + 1);
    assert.equal(
      Number(
        (
          await f.db.query('SELECT count(*) count FROM confirmations WHERE booking_id=$1', [
            f.booking.id,
          ])
        ).rows[0].count,
      ),
      2,
    );
    const state = await snapshot(f.db, testOwner),
      booking = state.bookings.find((b) => b.id === f.booking.id)!;
    assert.match(booking.confirmations, /EXACT-PNR/);
    assert.match(booking.confirmations, /HOTEL-REF/);
    const versions = (
      await f.db.query('SELECT * FROM itinerary_revisions WHERE booking_id=$1 ORDER BY revision', [
        f.booking.id,
      ])
    ).rows;
    assert.equal(versions[0].snapshot.travel_end, '2026-12-03');
    assert.equal(versions.at(-1)?.snapshot.travel_end, '2026-12-07');
    assert.equal(versions.at(-1)?.actor, testOwner.id);
  } finally {
    await f.db.close();
  }
});
test('partial outside-award cancellation refunds actual broker dollars and leaves the other travel active', async () => {
  const f = await setup();
  try {
    const award = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.points.id,
      source_id: f.broker.id,
      mode: 'Outside source',
      unit: 'points',
      quantity: 70000,
      cost: 85000,
      date: '2026-10-29',
      settled: true,
      payment_method: 'ACH',
    });
    const hotel = await f.run('travel_component', {
      booking_id: f.booking.id,
      product: 'Hotel',
      summary: 'Hotel stays active',
      provider_id: f.provider.id,
      channel: 'Direct Hotel',
      travel_start: '2026-12-01',
      travel_end: '2026-12-03',
    });
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: hotel.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 10000,
      cost: 10000,
      source_id: f.provider.id,
      date: '2026-10-29',
    });
    await f.run('payment', {
      party_id: f.customer.id,
      direction: 'customer',
      amount: 130000,
      date: '2026-10-29',
      method: 'Zelle',
      allocations: [{ booking_id: f.booking.id, amount: 130000 }],
    });
    const refund = await f.run('cancel', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      funding_component_id: award.funding_component_id,
      supplier_expected: 85000,
      customer_due: 100000,
      charge_reduction: 100000,
      date: '2026-10-30',
      due_on: '2026-11-01',
      reason: 'Actual flight-only cancellation, hotel retained',
    });
    assert.equal(refund.unit, 'cents');
    assert.equal(Number(refund.expected_basis), 85000);
    await f.run('receive_refund', {
      refund_id: refund.id,
      amount: 85000,
      form: 'cash',
      date: '2026-10-31',
      method: 'ACH',
    });
    await f.run('pay_refund', {
      refund_id: refund.id,
      amount: 100000,
      date: '2026-10-31',
      method: 'Zelle',
    });
    const booking = await economics(f.db, f.booking.id);
    assert.equal(booking.reservation_status, 'Booked');
    assert.equal(Number(booking.customer_balance), 0);
    assert.equal(Number(booking.profit), 20000);
    const returned = (await f.db.query("SELECT * FROM payments WHERE direction='supplier_refund'"))
      .rows[0];
    assert.equal(returned.party_id, f.broker.id);
    assert.equal(Number(returned.amount), 85000);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM asset_movements')).rows[0].count),
      0,
    );
    const state = await snapshot(f.db, testOwner);
    assert.equal(state.travelComponents.find((t) => t.id === f.travel.id)?.status, 'Cancelled');
    assert.equal(state.travelComponents.find((t) => t.id === hotel.id)?.status, 'Booked');
    assert.equal(state.refunds.find((r) => r.id === refund.id)?.travel_component_id, f.travel.id);
  } finally {
    await f.db.close();
  }
});
test('outside certificate refund credits actual unpaid source cost without creating owned certificates or cash', async () => {
  const f = await setup('Hotel');
  try {
    const fulfillment = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: f.certificate.id,
      source_id: f.broker.id,
      mode: 'Outside source',
      unit: 'count',
      quantity: 1,
      cost: 15000,
      date: '2026-10-29',
    });
    const refund = await f.run('cancel', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      funding_component_id: fulfillment.funding_component_id,
      supplier_expected: 15000,
      customer_due: 0,
      charge_reduction: 30000,
      date: '2026-10-30',
      due_on: '2026-11-01',
      reason: 'Confirmed unused external certificate supplier credit',
    });
    assert.equal(refund.unit, 'cents');
    await f.run('receive_refund', {
      refund_id: refund.id,
      amount: 15000,
      form: 'Supplier payable credit',
      date: '2026-10-31',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).supplier_balance), 0);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    assert.equal(Number((await f.db.query('SELECT count(*) count FROM assets')).rows[0].count), 0);
  } finally {
    await f.db.close();
  }
});
test('one refund cannot both restore owned inventory and report a cash receipt', async () => {
  const f = await setup();
  try {
    const instrument = await f.run('instrument', {
      program_id: f.program.id,
      name: 'Synthetic monetary voucher',
      unit: 'money',
      role: 'Both',
    });
    const asset = await f.run('acquire_asset', {
      name: 'Synthetic discounted voucher',
      kind: 'Voucher',
      unit: 'money',
      instrument_id: instrument.id,
      issuer: 'Synthetic',
      quantity: 10000,
      cost: 8000,
      date: '2026-10-29',
    });
    const fulfillment = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      instrument_id: instrument.id,
      asset_id: asset.id,
      mode: 'Owned inventory',
      unit: 'money',
      quantity: 10000,
      date: '2026-10-29',
    });
    const funding = (
      await f.db.query('SELECT * FROM funding_components WHERE id=$1', [
        fulfillment.funding_component_id,
      ])
    ).rows[0];
    const refund = await f.run('cancel', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      funding_component_id: funding.id,
      supplier_expected: 10000,
      customer_due: 0,
      charge_reduction: 0,
      date: '2026-10-30',
      due_on: '2026-11-01',
      reason: 'Synthetic actual return choice',
    });
    await assert.rejects(
      f.run('receive_refund', {
        refund_id: refund.id,
        amount: 10000,
        form: 'cash',
        asset_id: asset.id,
        original_movement_id: funding.asset_movement_id,
        date: '2026-10-31',
      }),
      /cash refund cannot also restore/,
    );
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      0,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM refund_movements')).rows[0].count),
      0,
    );
  } finally {
    await f.db.close();
  }
});
test('legacy booking entry also requires an actual indirect payee and can add a real cost after explicit zero-cost confirmation', async () => {
  const f = await setup();
  try {
    await assert.rejects(
      f.run('fund', {
        booking_id: f.booking.id,
        kind: 'Card',
        face_amount: 10000,
        cost: 10000,
        date: '2026-10-29',
      }),
      /actual supplier\/payee/,
    );
    const direct = await f.run('booking', {
      customer_id: f.customer.id,
      supplier_id: f.provider.id,
      product: 'Flight',
      channel: 'Direct Airline',
      summary: 'Initially free synthetic booking',
      booked_on: '2026-10-29',
      travel_start: '2026-12-01',
      travel_end: '2026-12-02',
      sale: 20000,
      itinerary: { cost_status: 'No supplier cost' },
    });
    assert.equal(Number((await economics(f.db, direct.id)).profit), 20000);
    await f.run('fund', {
      booking_id: direct.id,
      kind: 'Card',
      face_amount: 5000,
      cost: 5000,
      date: '2026-10-29',
    });
    assert.equal(Number((await economics(f.db, direct.id)).profit), 15000);
    assert.equal((await economics(f.db, direct.id)).itinerary.cost_status, 'Confirmed');
    const obligation = (
      await f.db.query('SELECT * FROM supplier_obligations WHERE booking_id=$1', [direct.id])
    ).rows[0];
    assert.equal(obligation.supplier_id, f.provider.id);
  } finally {
    await f.db.close();
  }
});
test('late cancellation fee records the actual expense once without reopening travel or inventing a customer charge', async () => {
  const f = await setup();
  try {
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 100000,
      cost: 100000,
      source_id: f.provider.id,
      date: '2026-10-29',
    });
    const referral = await f.run('referral', {
      booking_id: f.booking.id,
      referrer_id: f.broker.id,
      basis: 'fixed',
      fixed_amount: 1000,
      due_on: '2026-12-04',
      date: '2026-10-29',
    });
    await f.run('cancel', {
      booking_id: f.booking.id,
      supplier_expected: 0,
      customer_due: 0,
      charge_reduction: 0,
      date: '2026-10-30',
      due_on: '2026-10-31',
      reason: 'Nonrefundable synthetic whole-trip cancellation; agreed charges retained',
    });
    const key = randomUUID(),
      data = {
        booking_id: f.booking.id,
        travel_component_id: f.travel.id,
        payee_id: f.broker.id,
        amount: 5000,
        date: '2026-10-31',
        settled: true,
        method: 'ACH',
        reference: 'UNIQUE-CANCEL-FEE-1',
        reason: 'Actual new supplier cancellation fee, not included in original funding',
      };
    await f.run('cancellation_cost', data, key);
    await f.run('cancellation_cost', data, key);
    await assert.rejects(f.run('cancellation_cost', data), /reference is already recorded/);
    const booking = await economics(f.db, f.booking.id);
    assert.equal(booking.reservation_status, 'Cancelled');
    assert.equal(Number(booking.sale), 130000);
    assert.equal(Number(booking.funding_cost), 105000);
    assert.equal(Number(booking.referral_due), 0);
    assert.equal(Number(booking.profit), 25000);
    const payment = (await f.db.query('SELECT * FROM payments')).rows[0];
    assert.equal(Number(payment.amount), 5000);
    assert.equal(payment.party_id, f.broker.id);
    assert.equal(payment.method, 'ACH');
    await assert.rejects(
      f.run('pay_referral', {
        referral_id: referral.id,
        amount: 1000,
        date: '2026-12-04',
        method: 'Bank',
      }),
      /exceeds payable/,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM referral_payments')).rows[0].count),
      0,
    );
    assert.equal(
      (await snapshot(f.db, testOwner)).travelComponents.find((t) => t.id === f.travel.id)?.status,
      'Cancelled',
    );
    await assert.rejects(
      f.run('fulfill', {
        booking_id: f.booking.id,
        travel_component_id: f.travel.id,
        mode: 'Cash/Card',
        unit: 'money',
        quantity: 5000,
        cost: 5000,
        source_id: f.broker.id,
        date: '2026-10-31',
      }),
      /travel is canceled/,
    );
  } finally {
    await f.db.close();
  }
});
