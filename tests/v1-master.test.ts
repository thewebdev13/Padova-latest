import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { snapshot } from '../src/lib/queries';
import { existingFixture } from './padova-fixture';
import { percentagePrice, validateSegments, latestCreditRequests } from '../src/lib/v1-entry';
import { parseQuickPaste, quickPasteExample, exactPointCost } from '../src/lib/quick-paste';

test('V1 exact pricing, segments and external AI protocol preserve unknowns', () => {
  assert.equal(percentagePrice(200000, 800), 184000);
  assert.equal(percentagePrice(101, 5000), 51);
  assert.equal(exactPointCost(13000, '1.30', 'cents per point'), 16900);
  const pasted = parseQuickPaste(quickPasteExample);
  assert.equal(pasted.fields.points_quantity, '13000');
  assert.equal(pasted.fields.source_profile, undefined);
  assert.equal(pasted.fields.customer_paid, 'Unpaid');
  assert.equal(pasted.unknown.length, 0);
  assert.throws(() =>
    validateSegments(
      [{ origin: 'JFK', destination: 'ATL', date: '2027-02-01' }],
      '2027-02-01',
      '2027-02-01',
    ),
  );
});

test('V1 prepared profile tables deny browser roles and retain immutable links', async () => {
  const { raw } = await existingFixture(undefined, undefined, false, true);
  try {
    for (const table of ['booking_source_profiles', 'source_profile_assets']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
          assert.equal(
            (
              await raw.query('SELECT has_table_privilege($1,$2,$3) allowed', [
                role,
                `padova.${table}`,
                privilege,
              ])
            ).rows[0].allowed,
            false,
          );
      }
      assert.equal(
        (
          await raw.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [
            `padova.${table}`,
          ])
        ).rows[0].relrowsecurity,
        true,
      );
      assert.equal(
        (
          await raw.query('SELECT has_table_privilege($1,$2,$3) allowed', [
            'padova_app_server',
            `padova.${table}`,
            'UPDATE',
          ])
        ).rows[0].allowed,
        false,
      );
    }
    await raw.exec(
      "INSERT INTO padova.booking_source_profiles(name,source_method_id,provider,status,created_by) SELECT 'Synthetic profile',id,'Capital One','Active','test' FROM padova.booking_source_methods WHERE name='Capital One Travel'",
    );
    await assert.rejects(
      raw.exec("UPDATE padova.booking_source_profiles SET status='Inactive'"),
      /immutable|append|history/i,
    );
  } finally {
    await raw.close();
  }
});

test('V1 profiles, multi-city, discount, independent credit requests, exact reuse and permissions', async (t) => {
  const db = await financialDatabase();
  const run = (kind: any, data: any, key = randomUUID()) =>
    execute(db, testOwner, { id: key, kind, data });
  const date = '2026-10-30';
  try {
    const customer = await run('party', {
      name: 'V1 Customer',
      kind: 'person',
      roles: ['customer'],
    });
    const method = (
      await db.query("SELECT * FROM booking_source_methods WHERE name='Capital One Travel'")
    ).rows[0];
    const otherMethod = (await db.query("SELECT * FROM booking_source_methods WHERE name='GDS'"))
      .rows[0];
    const profile = await run('booking_source_profile', {
      name: 'Sam Venture X • 1234',
      provider: 'Capital One',
      holder_id: customer.id,
      source_method_id: method.id,
      safe_identifier: '1234',
    });
    const otherProfile = await run('booking_source_profile', {
      name: 'Other account',
      provider: 'Capital One',
      source_method_id: method.id,
    });
    const wrongProfile = await run('booking_source_profile', {
      name: 'GDS profile',
      provider: 'GDS',
      source_method_id: otherMethod.id,
    });
    const segments = [
      { origin: 'JFK', destination: 'ATL', date: '2027-02-01', flight_number: 'DL123' },
      { origin: 'ATL', destination: 'LAX', date: '2027-02-03' },
      { origin: 'LAX', destination: 'JFK', date: '2027-02-07' },
    ];
    const input = {
      customer_id: customer.id,
      product: 'Flight',
      channel: method.name,
      summary: 'V1 multi-city',
      booked_on: date,
      travel_start: segments[0].date,
      travel_end: segments.at(-1)!.date,
      sale: 184000,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'V1 multi-city',
          travel_start: segments[0].date,
          travel_end: segments.at(-1)!.date,
          details: { end_date_known: true, trip_type: 'Multi-City', segments },
        },
      ],
      operational: {
        version: 1,
        trip_type: 'Multi-City',
        segments,
        sale_known: true,
        source_method_id: method.id,
        source_profile_id: profile.id,
        pricing: {
          method: 'Percentage Off Comparable Online Price',
          comparable_price: 200000,
          discount_bps: 800,
        },
        components: [{ type: 'Padova payment', cost: 79060, method: 'Cash', date }],
      },
    };
    const b = await run('booking', input);
    await t.test(
      'current profit excludes unreceived commission and profile history cannot be forged',
      async () => {
        const payer = await run('party', {
          name: 'V1 Commission Payer',
          kind: 'company',
          roles: ['commission_payer'],
        });
        const hotel = await run('booking', {
          customer_id: customer.id,
          product: 'Hotel',
          channel: 'Direct Hotel',
          summary: 'V1 commission',
          booked_on: date,
          travel_start: '2027-02-01',
          travel_end: '2027-02-03',
          sale: 10000,
          travel_components_input: [
            {
              product: 'Hotel',
              summary: 'V1 commission',
              travel_start: '2027-02-01',
              travel_end: '2027-02-03',
              details: { end_date_known: true },
            },
          ],
          operational: {
            version: 1,
            sale_known: true,
            components: [{ type: 'Padova payment', cost: 9000, method: 'Cash', date }],
            commission: {
              expected: 'Yes',
              amount: 1000,
              payer_id: payer.id,
              received: 300,
              received_on: date,
              method: 'Wire',
            },
          },
        });
        const result = await economics(db, hotel.id);
        assert.equal(result.profit, 2000);
        assert.equal(result.current_profit, 1300);
        assert.equal(result.received_commission, 300);
        await assert.rejects(
          run('booking_source_profile_link', {
            booking_id: b.id,
            profile_id: wrongProfile.id,
            date,
            reason: 'Wrong source must fail',
          }),
          /match this booking source/,
        );
        await run('booking_source_profile_link', {
          booking_id: b.id,
          profile_id: profile.id,
          date,
          reason: 'Explicit matching profile retained',
        });
        await assert.rejects(
          run('revise', {
            booking_id: b.id,
            summary: input.summary,
            travel_start: input.travel_start,
            travel_end: input.travel_end,
            itinerary: {
              operational_entry: { ...input.operational, source_profile_id: otherProfile.id },
              cost_status: 'Confirmed',
            },
            date,
            reason: 'Forged operational metadata must fail',
          }),
          /Operational entry metadata/,
        );
      },
    );
    await t.test('forged profile, segment dates and percentage cannot post', async () => {
      await assert.rejects(run('booking', { ...input, sale: 100 }), /percentage/);
      await assert.rejects(
        run('booking', {
          ...input,
          operational: { ...input.operational, source_profile_id: wrongProfile.id },
        }),
        /profile/,
      );
      await assert.rejects(
        run('booking', {
          ...input,
          operational: { ...input.operational, segments: [...segments].reverse() },
        }),
        /travel order/,
      );
      const travel = (await db.query('SELECT * FROM travel_components WHERE booking_id=$1', [b.id]))
        .rows[0];
      assert.equal(travel.details.segments.length, 3);
    });
    const request = await run('price_match_event', {
      booking_id: b.id,
      status: 'Pending',
      requested_amount: 19792,
      expected_credit: 19792,
      profile_id: profile.id,
      date,
      reason: 'Price match submitted',
      reference: 'V1-CREDIT-A',
    });
    await run('price_match_event', {
      booking_id: b.id,
      status: 'Pending',
      requested_amount: 3000,
      expected_credit: 3000,
      profile_id: profile.id,
      date,
      reason: 'Separate request',
      reference: 'V1-CREDIT-B',
    });
    await run('price_match_event', {
      booking_id: b.id,
      request_id: request.id,
      status: 'Approved',
      approved_amount: 19792,
      date,
      reason: 'Confirmed by portal',
    });
    assert.equal((await economics(db, b.id)).net_economic_cost, 79060);
    assert.equal((await db.query('SELECT * FROM source_profile_assets')).rows.length, 0);
    const key = randomUUID();
    const receipt = {
      booking_id: b.id,
      request_id: request.id,
      status: 'Received',
      received_amount: 19792,
      received_on: date,
      date,
      reason: 'Actually available in account',
      reference: 'V1-CREDIT-A',
    };
    await run('price_match_event', receipt, key);
    await run('price_match_event', receipt, key);
    await assert.rejects(run('price_match_event', receipt), /closed/);
    assert.equal((await economics(db, b.id)).net_economic_cost, 59268);
    const link = (await db.query('SELECT * FROM source_profile_assets')).rows[0];
    assert.equal(link.profile_id, profile.id);
    const history = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id])).rows[0]
      .itinerary.price_match_history;
    assert.equal(history.length, 4);
    assert.equal(latestCreditRequests(history).length, 2);
    const reuse = {
      ...input,
      operational: {
        ...input.operational,
        components: [
          { type: 'Owned value', asset_id: link.asset_id, quantity: 10000, unit: 'money', date },
        ],
      },
    };
    const next = await run('booking', reuse);
    assert.equal(Number((await economics(db, next.id)).funding_cost), 10000);
    assert.equal(
      Number(
        (await db.query('SELECT balance FROM asset_balances WHERE id=$1', [link.asset_id])).rows[0]
          .balance,
      ),
      9792,
    );
    await assert.rejects(
      run('booking', {
        ...reuse,
        operational: { ...reuse.operational, source_profile_id: otherProfile.id },
      }),
      /different booking source profile/,
    );
    await assert.rejects(
      run('booking', { ...reuse, operational: { ...reuse.operational, source_profile_id: null } }),
      /different booking source profile/,
    );
    const converted = await run('convert_asset', {
      asset_id: link.asset_id,
      name: 'Account-linked converted voucher',
      kind: 'Voucher',
      issuer: 'Capital One',
      quantity_sent: 1000,
      quantity_received: 1000,
      date,
      reason: 'Synthetic conversion must retain its original source profile',
    });
    assert.equal(
      (
        await db.query('SELECT profile_id FROM source_profile_assets WHERE asset_id=$1', [
          converted.id,
        ])
      ).rows[0].profile_id,
      profile.id,
    );
    const generic = await run('acquire_asset', {
      name: 'Generic synthetic target',
      kind: 'Voucher',
      issuer: 'Capital One',
      ownership: 'Padova',
      quantity: 10000,
      cost: 0,
      date,
    });
    await assert.rejects(
      run('transfer_asset', {
        sending_asset_id: converted.id,
        receiving_asset_id: generic.id,
        quantity_sent: 100,
        quantity_received: 100,
        date,
      }),
      /different or unlinked profile/,
    );
    const employee = await financialEmployee(db);
    await assert.rejects(
      execute(db, employee, {
        id: randomUUID(),
        kind: 'price_match_event',
        data: { ...receipt, request_id: undefined },
      }),
      /Permission required/,
    );
    const state = await snapshot(db, testOwner);
    assert(state.attention.some((a: any) => a.key.startsWith('credit-request:')));
    const journal = (await db.query('SELECT sum(debit-credit) balance FROM journal_lines')).rows[0];
    assert.equal(Number(journal.balance), 0);
  } finally {
    await db.close();
  }
});
