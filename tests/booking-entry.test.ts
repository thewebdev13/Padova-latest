import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';

test('direct Padova payment and its actual refund preserve cash history without inventing an airline seller', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'Direct payment customer',
      kind: 'person',
      roles: ['customer'],
    });
    const method = (await db.query("SELECT * FROM booking_source_methods WHERE name='GDS'"))
      .rows[0];
    const b = await run('booking', {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'Direct paid flight',
      booked_on: '2026-10-29',
      travel_start: '2027-02-01',
      travel_end: '2027-02-01',
      sale: 12000,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Direct paid flight',
          travel_start: '2027-02-01',
          travel_end: '2027-02-01',
        },
      ],
      customer_payment: { amount: 12000, date: '2026-10-29', method: 'Wire' },
      operational: {
        version: 1,
        sale_known: true,
        source_method_id: method.id,
        components: [{ type: 'Padova payment', cost: 10000, method: 'Cash', date: '2026-10-29' }],
      },
    });
    assert.equal((await economics(db, b.id)).profit, 2000);
    assert.equal((await economics(db, b.id)).supplier_balance, 0);
    const f = (await db.query('SELECT * FROM funding_components WHERE booking_id=$1', [b.id]))
      .rows[0];
    const travel = (await db.query('SELECT id FROM travel_components WHERE booking_id=$1', [b.id]))
      .rows[0];
    const r = await run('cancel', {
      booking_id: b.id,
      travel_component_id: travel.id,
      funding_component_id: f.id,
      supplier_expected: 10000,
      customer_due: 12000,
      charge_reduction: 12000,
      date: '2026-10-30',
      due_on: '2026-10-30',
      reason: 'Actual synthetic cancellation',
    });
    await run('receive_refund', {
      refund_id: r.id,
      amount: 10000,
      form: 'cash',
      date: '2026-10-30',
      method: 'Cash',
      reference: 'DIRECT-RETURN',
    });
    await run('pay_refund', {
      refund_id: r.id,
      amount: 12000,
      date: '2026-10-30',
      method: 'Wire',
      reference: 'CUSTOMER-RETURN',
    });
    assert.equal((await economics(db, b.id)).profit, 0);
    assert.equal(
      Number(
        (await db.query("SELECT sum(debit-credit) net FROM journal_lines WHERE account='cash'"))
          .rows[0].net,
      ),
      0,
    );
    assert.equal(
      (await db.query('SELECT * FROM supplier_obligations WHERE booking_id=$1', [b.id])).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query('SELECT cost FROM funding_components WHERE id=$1', [f.id])).rows[0].cost,
      10000,
    );
  } finally {
    await db.close();
  }
});

test('operational booking separates brand, booking method, sellers, customer cards, owned lots and actual payments atomically', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any, id = randomUUID()) =>
    execute(db, testOwner, { id, kind, data });
  try {
    const customer = await run('party', {
      name: 'Entry customer',
      kind: 'person',
      roles: ['customer'],
    });
    const united = await run('party', {
      name: 'United',
      kind: 'company',
      roles: ['airline'],
    });
    const seller = await run('party', { name: 'John Smith', kind: 'person', roles: ['seller'] });
    const program = await run('program', { name: 'AAdvantage', category: 'Airline' });
    const methods = (await db.query('SELECT * FROM booking_source_methods')).rows;
    const method = methods.find((m) => m.name === 'Amex Travel / Business Platinum')!;
    const make = (components: any[], sale = 490000, extra: any = {}) => ({
      customer_id: customer.id,
      product: 'Flight',
      channel: method.name,
      summary: 'EWR-TLV-EWR',
      booked_on: '2026-10-29',
      travel_start: '2027-02-01',
      travel_end: '2027-02-10',
      sale,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'EWR-TLV-EWR',
          provider_id: united.id,
          travel_start: '2027-02-01',
          travel_end: '2027-02-10',
          details: {
            route: 'EWR-TLV-EWR',
            confirmations: ['ABC123'],
            booking_source_confirmation: ['AMEX999'],
            reservation_summary: 'Keep this exact multiline\nreservation summary',
          },
        },
      ],
      itinerary: { cost_status: 'Pending' },
      operational: {
        version: 1,
        source_method_id: method.id,
        sale_known: true,
        new_travelers: ['New Typed Guest'],
        references: [
          { type: 'airline_pnr', value: 'ABC123' },
          { type: 'booking_source_confirmation', value: 'AMEX999' },
        ],
        notes: 'Visible booking notes',
        components,
        ...extra,
      },
    });
    const outside = {
      type: 'Outside seller',
      seller_id: seller.id,
      supplied: 'Complete Booking / Points-funded booking',
      cost: 440000,
      unit: 'count',
      quantity: 1,
      date: '2026-10-29',
      paid: 0,
    };
    const key = randomUUID(),
      data = make([outside]);
    const b = await run('booking', data, key);
    assert.equal((await run('booking', data, key)).id, b.id);
    const e = await economics(db, b.id);
    assert.equal(e.supplier_id, null);
    assert.equal(e.sale, 490000);
    assert.equal(e.obligations, 440000);
    assert.equal(e.profit, 50000);
    assert.equal(
      (await db.query('SELECT supplier_id FROM supplier_obligations WHERE booking_id=$1', [b.id]))
        .rows[0].supplier_id,
      seller.id,
    );
    const t = (await db.query('SELECT * FROM travel_components WHERE booking_id=$1', [b.id]))
      .rows[0];
    assert.equal(t.provider_id, united.id);
    assert.equal(t.details.booking_source_confirmation[0], 'AMEX999');
    assert.equal(t.details.reservation_summary, 'Keep this exact multiline\nreservation summary');
    assert.equal(
      (await db.query('SELECT * FROM booking_references WHERE booking_id=$1', [b.id])).rows.length,
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM parties WHERE name='New Typed Guest'")).rows.length,
      1,
    );
    const award = await run(
      'booking',
      make(
        [
          {
            ...outside,
            supplied: 'Points / Miles',
            unit: 'points',
            quantity: 100000,
            cost: 200000,
          },
        ],
        250000,
        { source_method_id: methods.find((m) => m.award)!.id, award_program_id: program.id },
      ),
    );
    assert.equal(
      (await db.query('SELECT * FROM asset_movements WHERE booking_id=$1', [award.id])).rows.length,
      0,
    );
    assert.equal((await economics(db, award.id)).profit, 50000);
    const unknownQuantity = await run(
      'booking',
      make(
        [
          {
            ...outside,
            supplied: 'Points / Miles',
            unit: 'points',
            quantity: undefined,
            cost: 200000,
          },
        ],
        250000,
      ),
    );
    const unknownDetail = (
      await db.query('SELECT * FROM fulfillment_details WHERE booking_id=$1', [unknownQuantity.id])
    ).rows[0];
    assert.equal(unknownDetail.quantity, null);
    assert.equal(unknownDetail.unit, 'points');
    await run('revise_fulfillment', {
      booking_id: unknownQuantity.id,
      fulfillment_id: unknownDetail.id,
      expected_version: 0,
      travel_component_id: unknownDetail.travel_component_id,
      mode: 'Outside source',
      unit: 'points',
      source_id: seller.id,
      cost: 200000,
      date: '2026-10-29',
      reason: 'Keep unknown point quantity during a reference-only edit',
      terms: { reference: 'UNKNOWN-QUANTITY-RETAINED', supplied: 'Points / Miles' },
    });
    assert.equal(
      (await db.query('SELECT * FROM funding_components WHERE booking_id=$1', [unknownQuantity.id]))
        .rows.length,
      1,
    );
    assert.equal((await economics(db, unknownQuantity.id)).funding_cost, 200000);
    assert.equal(
      (await db.query('SELECT * FROM asset_movements WHERE booking_id=$1', [unknownQuantity.id]))
        .rows.length,
      0,
    );
    const voucher = await run('acquire_asset', {
      name: 'Owned voucher',
      kind: 'Voucher',
      issuer: 'United',
      unit: 'money',
      quantity: 100000,
      cost: 80000,
      date: '2026-10-29',
      seller_id: seller.id,
    });
    const points = await run('acquire_asset', {
      name: 'Owned point lot',
      kind: 'Points',
      issuer: 'Membership Rewards',
      unit: 'points',
      quantity: 100000,
      cost: 70000,
      date: '2026-10-29',
      seller_id: seller.id,
    });
    const pointsBooking = await run(
      'booking',
      make(
        [
          {
            type: 'Owned value',
            asset_id: points.id,
            unit: 'points',
            quantity: 80000,
            date: '2026-10-29',
          },
        ],
        80000,
      ),
    );
    assert.equal((await economics(db, pointsBooking.id)).funding_cost, 56000);
    const pointsBalance = (await db.query('SELECT * FROM asset_balances WHERE id=$1', [points.id]))
      .rows[0];
    assert.equal(Number(pointsBalance.balance), 20000);
    assert.equal(Number(pointsBalance.remaining_basis), 14000);
    const used = await run(
      'booking',
      make(
        [
          {
            type: 'Owned value',
            asset_id: voucher.id,
            unit: 'money',
            quantity: 60000,
            date: '2026-10-29',
          },
        ],
        70000,
      ),
    );
    assert.equal((await economics(db, used.id)).funding_cost, 48000);
    const balance = (await db.query('SELECT * FROM asset_balances WHERE id=$1', [voucher.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 40000);
    assert.equal(Number(balance.remaining_basis), 32000);
    const card = await run(
      'booking',
      make(
        [
          {
            type: 'Customer card',
            owner_id: customer.id,
            cost: 400000,
            card_nickname: 'Customer personal card',
            last_four: '1234',
            date: '2026-10-29',
          },
        ],
        50000,
      ),
    );
    const cardE = await economics(db, card.id);
    assert.equal(cardE.funding_cost, 0);
    assert.equal(cardE.obligations, 0);
    assert.equal(cardE.profit, 50000);
    assert.equal(
      (
        await db.query("SELECT * FROM journal_lines WHERE booking_id=$1 AND account='cash'", [
          card.id,
        ])
      ).rows.length,
      0,
    );
    const partial = await run('booking', {
      ...make([{ ...outside, cost: 400000, paid: 150000, method: 'ACH' }], 500000),
      customer_payment: { amount: 300000, date: '2026-10-29', method: 'Wire' },
    });
    const partialE = await economics(db, partial.id);
    assert.equal(partialE.customer_balance, 200000);
    assert.equal(partialE.supplier_balance, 250000);
    assert.equal(partialE.profit, 100000);
    const directVoucher = await run(
      'booking',
      make(
        [
          {
            ...outside,
            supplied: 'Voucher / Travel Credit',
            quantity: 60000,
            unit: 'money',
            cost: 45000,
            paid: 20000,
            method: 'ACH',
          },
        ],
        80000,
      ),
    );
    assert.equal(
      (await db.query('SELECT * FROM asset_movements WHERE booking_id=$1', [directVoucher.id])).rows
        .length,
      0,
    );
    const acquired = await run(
      'booking',
      make(
        [
          {
            ...outside,
            supplied: 'Voucher / Travel Credit',
            unit: 'money',
            quantity: 60000,
            cost: 80000,
            paid: 30000,
            method: 'Wire',
            new_asset: {
              name: 'Transferred reusable voucher',
              kind: 'Voucher',
              issuer: 'United',
              quantity: 100000,
              cost: 80000,
            },
          },
        ],
        80000,
      ),
    );
    const acquiredE = await economics(db, acquired.id);
    assert.equal(acquiredE.funding_cost, 48000);
    assert.equal(acquiredE.supplier_balance, 0);
    assert.equal(
      (await detail(db, testOwner, 'booking', acquired.id)).assetAcquisitions[0].due,
      50000,
    );
    const acquiredAsset = (
      await db.query("SELECT * FROM asset_balances WHERE name='Transferred reusable voucher'")
    ).rows[0];
    assert.equal(Number(acquiredAsset.balance), 40000);
    assert.equal(Number(acquiredAsset.remaining_basis), 32000);
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT sum(amount) amount FROM asset_acquisition_payments WHERE asset_id=$1',
            [acquiredAsset.id],
          )
        ).rows[0].amount,
      ),
      30000,
    );
    const account = await run('payment_account', {
      name: 'Practice card',
      kind: 'Card',
      last_four: '4242',
    });
    const mixed = await run(
      'booking',
      make(
        [
          { ...outside, supplied: 'Certificate / Award', unit: 'count', quantity: 1, cost: 10000 },
          {
            type: 'Padova payment',
            cost: 5000,
            method: 'Card',
            account_id: account.id,
            date: '2026-10-29',
          },
          {
            type: 'Owned value',
            asset_id: voucher.id,
            unit: 'money',
            quantity: 10000,
            date: '2026-10-29',
          },
        ],
        50000,
      ),
    );
    assert.equal((await economics(db, mixed.id)).funding_cost, 23000);
    assert.equal(
      (await db.query('SELECT * FROM fulfillment_details WHERE booking_id=$1', [mixed.id])).rows
        .length,
      3,
    );
    const worker = await financialEmployee(db);
    await assert.rejects(
      execute(db, worker, { id: randomUUID(), kind: 'booking', data: make([outside], 0) }),
      /manage_funding/,
    );
    const workerView = await detail(db, worker, 'booking', mixed.id);
    assert.equal(workerView.booking.itinerary.operational_entry.components, undefined);
    const staffBooking = await execute(db, worker, {
      id: randomUUID(),
      kind: 'booking',
      data: {
        ...make([], 0, { sale_known: false }),
        customer_payment: {
          amount: 5000,
          date: '2026-10-29',
          method: 'Wire',
          reference: 'ENTRY-STAFF-CREDIT',
          allocate_to_booking: false,
        },
      },
    });
    assert.equal((await economics(db, staffBooking.id)).sale, null);
    await assert.rejects(
      execute(db, worker, {
        id: randomUUID(),
        kind: 'confirm_sale',
        data: {
          booking_id: staffBooking.id,
          total: 10000,
          date: '2026-10-29',
          reason: 'Not permitted',
        },
      }),
      /edit_customer_charges/,
    );
    await run('confirm_sale', {
      booking_id: staffBooking.id,
      total: 10000,
      date: '2026-10-29',
      reason: 'Authorized billing confirms the actual customer total',
    });
    assert.equal((await economics(db, staffBooking.id)).customer_balance, 10000);
    const credit = (await db.query("SELECT id FROM payments WHERE reference='ENTRY-STAFF-CREDIT'"))
      .rows[0];
    await run('allocate', {
      booking_id: staffBooking.id,
      payment_id: credit.id,
      amount: 5000,
      date: '2026-10-29',
    });
    assert.equal((await economics(db, staffBooking.id)).customer_balance, 5000);
    assert.equal(
      (await db.query("SELECT * FROM payments WHERE reference='ENTRY-STAFF-CREDIT'")).rows.length,
      1,
    );
    assert.equal((await snapshot(db, worker)).travelerReview, null);
    if (db.storage === 'padova') {
      for (const relation of ['booking_source_methods', 'booking_references', 'booking_drafts']) {
        for (const role of ['anon', 'authenticated', 'service_role'])
          assert.equal(
            (
              await db.query("SELECT has_table_privilege($1,$2,'SELECT') access", [
                role,
                `padova.${relation}`,
              ])
            ).rows[0].access,
            false,
          );
      }
    }
    const before = (await db.query('SELECT count(*) count FROM parties')).rows[0].count;
    await assert.rejects(
      run('booking', make([{ ...outside, paid: 500000, method: 'ACH' }])),
      /exceed/,
    );
    assert.equal((await db.query('SELECT count(*) count FROM parties')).rows[0].count, before);
    const draft = await execute(db, worker, {
      id: randomUUID(),
      kind: 'booking_draft',
      data: {
        title: 'Incomplete unknown itinerary',
        entry: { product: 'Flight', customer_id: null, sale: null, travel_start: null },
      },
    });
    assert.equal(draft.draft, true);
    assert.equal((await snapshot(db, worker)).bookingDrafts.length, 1);
    assert.equal((await snapshot(db, worker)).bookingDrafts[0].entry, undefined);
    assert.equal((await detail(db, worker, 'draft', draft.id)).entry.sale, null);
    await assert.rejects(detail(db, testOwner, 'draft', draft.id));
    assert.equal((await snapshot(db, testOwner)).bookingDrafts.length, 0);
    const held = await execute(db, worker, {
      id: randomUUID(),
      kind: 'booking_draft',
      data: {
        title: 'Historical source record',
        entry: {
          summary: 'Voucher ending123456 sold to Example',
          itinerary: {
            historical_reconciliation_status: 'Held',
            notes: 'Original basis unknown',
          },
        },
      },
    });
    assert.equal(
      (await snapshot(db, worker)).bookingDrafts.find((d) => d.id === held.id)?.kind,
      'voucher_sale',
    );
    assert.equal(
      (await detail(db, worker, 'draft', held.id)).entry.itinerary.notes,
      'Original basis unknown',
    );
    await assert.rejects(detail(db, testOwner, 'draft', held.id));
    const hotelData = make(
      [{ type: 'Customer card', owner_id: customer.id, cost: 100000, date: '2026-10-29' }],
      10000,
      {
        commission: {
          expected: 'Yes',
          amount: 10000,
          payer_id: seller.id,
          due_on: '2026-10-28',
          received: 3000,
          received_on: '2026-10-29',
          method: 'ACH',
        },
      },
    );
    hotelData.product = 'Hotel';
    hotelData.operational.source_method_id = methods.find((m) => m.name === 'Direct Hotel')!.id;
    hotelData.travel_components_input[0].product = 'Hotel';
    hotelData.travel_components_input[0].provider_id = null;
    hotelData.travel_components_input[0].details.route = '';
    hotelData.operational.references = hotelData.operational.references.filter(
      (r: { type: string }) => r.type === 'booking_source_confirmation',
    );
    const hotel = await run('booking', hotelData);
    const hotelTravel = (
      await db.query('SELECT id FROM travel_components WHERE booking_id=$1', [hotel.id])
    ).rows[0];
    await assert.rejects(
      run('fulfill', {
        booking_id: hotel.id,
        travel_component_id: hotelTravel.id,
        mode: 'Cash/Card',
        cash_method: 'Card',
        unit: 'money',
        quantity: 1000,
        cost: 1000,
        date: '2026-10-29',
      }),
      /actual payee/,
      'A travel brand is never inferred as the modern booking financial counterparty',
    );
    const commission = (await snapshot(db, testOwner)).commissions.find(
      (c) => c.booking_id === hotel.id,
    )!;
    assert.equal(Number(commission.gross), 10000);
    assert.equal(Number(commission.received), 3000);
    assert.ok(
      (await snapshot(db, testOwner)).attention.some(
        (a) => a.booking_id === hotel.id && /commission/i.test(a.kind),
      ),
    );

    const secondaryPayer = await run('party', {
      name: 'Secondary commission payer',
      kind: 'company',
      roles: ['seller'],
    });
    const dualData = make(
      [{ type: 'Customer card', owner_id: customer.id, cost: 80000, date: '2026-10-29' }],
      12000,
      {
        commission: {
          expected: 'Yes',
          amount: 9000,
          payer_id: seller.id,
          due_on: '2026-10-28',
        },
        secondary_commission: {
          expected: 'Yes',
          amount: 2500,
          payer_id: secondaryPayer.id,
          due_on: '2026-10-28',
          notes: 'Extra expected commission',
        },
      },
    );
    dualData.product = 'Hotel';
    dualData.operational.source_method_id = methods.find((m) => m.name === 'Direct Hotel')!.id;
    dualData.travel_components_input[0].product = 'Hotel';
    dualData.travel_components_input[0].provider_id = null;
    dualData.travel_components_input[0].details.route = '';
    dualData.operational.references = dualData.operational.references.filter(
      (r: { type: string }) => r.type === 'booking_source_confirmation',
    );
    const dual = await run('booking', dualData);
    const dualCommissions = (await snapshot(db, testOwner)).commissions.filter(
      (c) => c.booking_id === dual.id,
    );
    assert.equal(dualCommissions.length, 2);
    assert.deepEqual(
      dualCommissions.map((c) => Number(c.gross)).sort((a, b) => a - b),
      [2500, 9000],
    );
    assert.equal(
      dualCommissions.filter((c) => c.payer_id === seller.id).length,
      1,
      'Primary IATA payer stays on primary commission',
    );
    assert.equal(
      dualCommissions.filter((c) => c.payer_id === secondaryPayer.id).length,
      1,
      'Secondary payer stays on secondary commission',
    );
    const markers = (
      await db.query(
        "SELECT body FROM notes WHERE record_type='booking' AND record_id=$1 ORDER BY created_at",
        [dual.id],
      )
    ).rows.map((n) => String(n.body));
    assert.ok(markers.some((body) => /\[primary\]/i.test(body)));
    assert.ok(markers.some((body) => /\[secondary\]/i.test(body)));
  } finally {
    await db.close();
  }
});
