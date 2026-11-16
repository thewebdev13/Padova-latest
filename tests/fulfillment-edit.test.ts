import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute, economics, supplierOutstanding } from '../src/lib/finance';
import { detail, snapshot } from '../src/lib/queries';
import { fulfillmentEntryTerms } from '../src/lib/fulfillment-entry';

test('customer-owned credit preserves owner and quantities without Padova cost, revenue, inventory valuation or supplier payment', async () => {
  const f = await setup();
  try {
    const data = {
      name: 'Customer airline credit',
      kind: 'Airline credit',
      issuer: 'Synthetic airline',
      quantity: 50000,
      cost: 0,
      ownership: 'Customer',
      holder_id: f.customer.id,
      date: '2026-10-29',
      restrictions: 'Named traveler only',
      expires_on: '2027-01-01',
    };
    await assert.rejects(f.run('acquire_asset', { ...data, cost: 100 }), /zero Padova cost/);
    await assert.rejects(
      f.run('acquire_asset', { ...data, holder_id: undefined }),
      /customer owner/,
    );
    const a = await f.run('acquire_asset', data);
    const request = {
      booking_id: f.booking.id,
      asset_id: a.id,
      kind: 'Airline credit',
      face_amount: 20000,
      date: '2026-10-29',
      confirm_cost: true,
    };
    await assert.rejects(f.run('fund', { ...request, cost: 100 }), /zero Padova use cost/);
    const other = await f.run('party', {
      name: 'Another customer',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    });
    const unrelated = await f.run('acquire_asset', { ...data, holder_id: other.id });
    await assert.rejects(f.run('fund', { ...request, asset_id: unrelated.id }), /must belong/);
    const key = randomUUID();
    const funding = await f.run('fund', request, key);
    assert.equal((await f.run('fund', request, key)).id, funding.id);
    assert.equal(Number(funding.cost), 0);
    const balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [a.id])).rows[0];
    assert.equal(balance.ownership, 'Customer');
    assert.equal(balance.holder_id, f.customer.id);
    assert.equal(Number(balance.balance), 30000);
    assert.equal(Number(balance.remaining_basis), 0);
    assert.equal(Number((await economics(f.db, f.booking.id)).sale), 100000);
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 0);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
    assert.equal(
      Number(
        (
          await f.db.query(
            "SELECT count(*) count FROM journal_lines WHERE account IN ('travel_inventory','booking_cost','supplier_payable','asset_acquisition_payable','customer_asset_liability')",
          )
        ).rows[0].count,
      ),
      0,
    );
    const managed = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Outside source',
      unit: 'money',
      asset_id: a.id,
      quantity: 10000,
      date: '2026-10-29',
    });
    assert.equal(Number(managed.cost_status === 'Confirmed'), 1);
    await f.run('reverse_fulfillment', {
      booking_id: f.booking.id,
      fulfillment_id: managed.id,
      expected_version: 0,
      date: '2026-10-29',
      reason: 'Customer credit was not actually applied; restore customer remaining value',
    });
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [a.id])).rows[0]
          .balance,
      ),
      30000,
    );
    await assert.rejects(
      f.run('sell_asset', {
        asset_id: a.id,
        buyer_id: other.id,
        quantity: 100,
        proceeds: 100,
        date: '2026-10-29',
      }),
      /Only Padova-owned/,
    );
  } finally {
    await f.db.close();
  }
});

test('outside points preserves quote and holder metadata, posts separate actual cash fees and supports metadata-only revision without duplicate costs', async () => {
  const f = await setup();
  try {
    const program = await f.run('program', { name: 'Outside award program', category: 'Airline' });
    const instrument = await f.run('instrument', {
      program_id: program.id,
      name: 'Outside miles',
      unit: 'points',
      role: 'Core',
    });
    const data = {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Outside source',
      instrument_id: instrument.id,
      unit: 'points',
      quantity: 70000,
      source_id: f.broker.id,
      cost: 85000,
      source_paid: 10000,
      payment_method: 'ACH',
      fee_amount: 8200,
      fee_source_id: f.provider.id,
      fee_settled: true,
      fee_payment_method: 'Card',
      fee_account_id: f.card.id,
      terms: {
        account_holder_id: f.customer.id,
        quoted_rate: '1.21428571',
        rate_unit: 'cents per point',
        mechanism: 'Outside points award',
        booked_through: 'Supplier-managed airline account',
        notes: 'Quoted price is evidence; fixed actual source invoice controls cost',
      },
      date: '2026-10-29',
    };
    const key = randomUUID();
    await assert.rejects(
      f.run('fulfill', { ...data, source_paid: 85001 }),
      /Partial source payment/,
    );
    const first = await f.run('fulfill', data, key);
    await f.run('fulfill', data, key);
    assert.ok(first.fee_fulfillment_id);
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 93200);
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 6800);
    const sourceView = await detail(f.db, testOwner, 'booking', f.booking.id);
    assert.deepEqual(
      sourceView.sourceBalances.find((r: any) => r.party_id === f.broker.id),
      { party_id: f.broker.id, name: 'Corrected fulfillment source', paid: 10000, due: 75000 },
    );
    assert.equal(
      Number((await supplierOutstanding(f.db, f.booking.id, f.broker.id)).amount),
      75000,
    );
    assert.equal(Number((await supplierOutstanding(f.db, f.booking.id, f.provider.id)).amount), 0);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM asset_movements')).rows[0].count),
      0,
    );
    await f.run('revise_fulfillment', {
      ...data,
      source_paid: undefined,
      fee_amount: undefined,
      fee_settled: false,
      fulfillment_id: first.id,
      expected_version: 0,
      reason: 'Correct quote note only',
      terms: { ...data.terms, quoted_rate: '1.21', notes: 'Updated supplier quote note' },
    });
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM funding_components')).rows[0].count),
      2,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      2,
    );
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 93200);
  } finally {
    await f.db.close();
  }
});

test('asset detail correction preserves ownership, quantities, basis and original acquisition; current expiry controls future use and stale edits fail', async () => {
  const f = await setup();
  try {
    const asset = await f.run('acquire_asset', {
      name: 'Original voucher',
      kind: 'Voucher',
      issuer: 'Synthetic',
      quantity: 50000,
      cost: 40000,
      date: '2026-10-29',
      expires_on: '2027-01-01',
    });
    const data = {
      asset_id: asset.id,
      expected_version: 0,
      name: 'Corrected voucher reference',
      issuer: 'Synthetic issuer',
      expires_on: '2026-10-30',
      restrictions: 'Actual issuer restriction',
      reference: 'CORRECT-REF',
      date: '2026-10-29',
      reason: 'Correct descriptive issuer details from the original document',
    };
    const key = randomUUID();
    await f.run('revise_asset', data, key);
    await f.run('revise_asset', data, key);
    const view = await detail(f.db, testOwner, 'asset', asset.id);
    assert.equal(view.asset.name, data.name);
    assert.equal(view.asset.edit_version, 1);
    assert.equal(Number(view.asset.balance), 50000);
    assert.equal(Number(view.asset.remaining_basis), 40000);
    assert.equal(view.asset.ownership, 'Padova');
    assert.equal(
      (await f.db.query('SELECT name FROM assets WHERE id=$1', [asset.id])).rows[0].name,
      'Original voucher',
    );
    const used = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Owned inventory',
      asset_id: asset.id,
      unit: 'money',
      quantity: 10000,
      date: '2026-10-29',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 8000);
    assert.equal(
      (await detail(f.db, testOwner, 'booking', f.booking.id)).funding.find(
        (r: any) => r.id === used.funding_component_id,
      ).kind,
      'Voucher',
    );
    await assert.rejects(f.run('revise_asset', data), /changed since/);
    await assert.rejects(
      f.run('revise_asset', { ...data, expected_version: 1, cost: 1 }),
      /Unrecognized key|unrecognized_keys/,
    );
    await assert.rejects(
      f.run('fund', {
        booking_id: f.booking.id,
        kind: 'Voucher',
        asset_id: asset.id,
        face_amount: 10000,
        date: '2026-10-31',
      }),
      /expired/,
    );
    await assert.rejects(
      execute(f.db, await financialEmployee(f.db), {
        id: randomUUID(),
        kind: 'revise_asset',
        data: { ...data, expected_version: 1 },
      }),
      /Permission required/,
    );
  } finally {
    await f.db.close();
  }
});

test('Amex portal entry keeps expected rebate pending until actual receipt; Chase price evidence does not create reference-price profit', async () => {
  const f = await setup();
  try {
    const program = await f.run('program', { name: 'Portal points', category: 'Bank' });
    const instrument = await f.run('instrument', {
      program_id: program.id,
      name: 'Portal points use',
      unit: 'points',
      role: 'Both',
    });
    const account = await f.run('program_account', {
      program_id: program.id,
      holder_id: f.customer.id,
      name: 'Owned portal account',
      ownership: 'Padova',
    });
    const asset = await f.run('acquire_asset', {
      name: 'Owned portal points',
      kind: 'Points',
      issuer: 'Synthetic',
      instrument_id: instrument.id,
      program_account_id: account.id,
      holder_id: f.customer.id,
      unit: 'points',
      quantity: 100000,
      cost: 70000,
      date: '2026-10-29',
    });
    const entry = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Owned inventory',
      instrument_id: instrument.id,
      asset_id: asset.id,
      unit: 'points',
      quantity: 100000,
      rebate_expected: 35000,
      fee_amount: 10000,
      fee_source_id: f.provider.id,
      terms: {
        mechanism: 'Amex Business Platinum Pay With Points',
        portal_price: 100000,
        reference_price: 150000,
        rate_cents_numerator: 100000,
        rate_points_denominator: 100000,
      },
      date: '2026-10-29',
    });
    assert.ok(entry.expected_event_id);
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      0,
    );
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 20000);
    await f.run('update_expected_event', {
      event_id: entry.expected_event_id,
      status: 'Posted',
      quantity_actual: 35000,
      date: '2026-10-30',
      reason: 'Actual issuer rebate arrived',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 44500);
    assert.equal(
      Number(
        (await f.db.query('SELECT balance FROM asset_balances WHERE id=$1', [asset.id])).rows[0]
          .balance,
      ),
      35000,
    );
    const draft = {
      program_account_id: account.id,
      mechanism: 'Amex Business Platinum Pay With Points',
      portal_price: 1000,
      reference_price: 1500,
      rate_cents_numerator: 1000,
      rate_points_denominator: 100000,
      restrictions: 'Named account only',
      reference: 'Corrected reference, optional fields collapsed',
    };
    await f.run('revise_fulfillment', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      fulfillment_id: entry.id,
      expected_version: 0,
      mode: 'Owned inventory',
      instrument_id: instrument.id,
      program_account_id: draft.program_account_id,
      asset_id: asset.id,
      unit: 'points',
      quantity: 100000,
      terms: fulfillmentEntryTerms(draft),
      date: '2026-10-31',
      reason:
        'Metadata-only edit after actual reward; collapsed account and quote fields must remain intact',
    });
    const revised = (await detail(f.db, testOwner, 'booking', f.booking.id)).fulfillments.find(
      (r: any) => r.id === entry.id,
    );
    assert.equal(revised.status, 'Active');
    assert.equal(revised.terms.reference_price, 150000);
    assert.equal(revised.terms.restrictions, 'Named account only');
    assert.equal(revised.program_account_id, account.id);
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM funding_components')).rows[0].count),
      2,
    );
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 44500);
    await assert.rejects(
      f.run('fulfill', {
        booking_id: f.booking.id,
        travel_component_id: f.travel.id,
        mode: 'Outside source',
        instrument_id: instrument.id,
        unit: 'points',
        quantity: 10000,
        source_id: f.broker.id,
        cost: 10000,
        rebate_expected: 3500,
        date: '2026-10-29',
      }),
      /owned-points use/,
    );
  } finally {
    await f.db.close();
  }
});

test('paid referral cancellation appends a recovery receivable and keeps the actual payment; unpaid default cancels without a fictional payout', async () => {
  const f = await setup();
  try {
    await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 50000,
      cost: 50000,
      source_id: f.provider.id,
      date: '2026-10-29',
    });
    const referral = await f.run('referral', {
      booking_id: f.booking.id,
      referrer_id: f.broker.id,
      basis: 'fixed',
      fixed_amount: 10000,
      after_receipt: true,
      due_on: '2026-12-03',
      date: '2026-10-29',
    });
    await f.run('pay_referral', {
      referral_id: referral.id,
      amount: 10000,
      date: '2026-12-03',
      method: 'Bank',
    });
    const data = {
      booking_id: f.booking.id,
      supplier_expected: 0,
      customer_due: 0,
      charge_reduction: 100000,
      date: '2026-12-04',
      due_on: '2026-12-04',
      reason: 'Underlying booking canceled after actual referral payout',
    };
    const key = randomUUID();
    await f.run('cancel', data, key);
    await f.run('cancel', data, key);
    assert.equal(Number((await economics(f.db, f.booking.id)).referral_due), 0);
    assert.equal(
      Number((await f.db.query('SELECT sum(amount) amount FROM referral_payments')).rows[0].amount),
      10000,
    );
    assert.equal(
      Number(
        (
          await f.db.query(
            "SELECT sum(debit-credit) amount FROM journal_lines WHERE account='referral_recovery_receivable'",
          )
        ).rows[0].amount,
      ),
      10000,
    );
    const view = await snapshot(f.db, testOwner);
    assert.ok(
      view.attention.some(
        (a: any) => a.key === `referral-recovery:${referral.id}` && a.amount === 10000,
      ),
    );
    await assert.rejects(
      f.run('pay_referral', {
        referral_id: referral.id,
        amount: 1,
        date: '2026-12-04',
        method: 'Bank',
      }),
      /exceeds payable/,
    );
  } finally {
    await f.db.close();
  }
});

async function setup() {
  const db = await financialDatabase();
  const run = (kind: any, data: any, key = randomUUID()) =>
    execute(db, testOwner, { id: key, kind, data });
  const customer = await run('party', {
    name: 'Fulfillment correction customer',
    kind: 'person',
    roles: ['customer', 'traveler', 'seller'],
  });
  const provider = await run('party', {
    name: 'Original fulfillment payee',
    kind: 'supplier',
    roles: ['seller', 'airline'],
  });
  const broker = await run('party', {
    name: 'Corrected fulfillment source',
    kind: 'partner',
    roles: ['seller'],
  });
  const card = await run('payment_account', {
    name: 'Synthetic fulfillment card',
    kind: 'Card',
    ownership: 'Padova',
  });
  const booking = await run('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Direct Airline',
    supplier_id: provider.id,
    summary: 'Correctable synthetic booking',
    booked_on: '2026-10-29',
    travel_start: '2026-12-01',
    travel_end: '2026-12-02',
    sale: 100000,
  });
  const travel = await run('travel_component', {
    booking_id: booking.id,
    product: 'Flight',
    provider_id: provider.id,
    channel: 'Direct Airline',
    summary: 'Correctable travel',
    travel_start: '2026-12-01',
    travel_end: '2026-12-02',
  });
  return { db, run, customer, provider, broker, booking, travel, card };
}

test('Employee can save an ordinary trip and actual unallocated receipt before billing, without inventing a sale or bypassing financial permissions', async () => {
  const f = await setup();
  try {
    const employee = await financialEmployee(f.db);
    const key = randomUUID();
    const request = {
      id: key,
      kind: 'booking' as const,
      data: {
        customer_id: f.customer.id,
        supplier_id: f.provider.id,
        product: 'Flight',
        channel: 'Direct Airline',
        summary: 'Staff operational trip before billing',
        booked_on: '2026-10-29',
        travel_start: '2027-01-25',
        travel_end: '2027-01-25',
        create_initial_travel: true,
        customer_payment: {
          amount: 10000,
          date: '2026-10-29',
          method: 'Wire',
          allocate_to_booking: false,
        },
      },
    };
    const booking = await execute(f.db, employee, request);
    assert.equal((await execute(f.db, employee, request)).id, booking.id);
    const economic = await economics(f.db, booking.id);
    assert.equal(Number(economic.sale), 0);
    assert.equal(Number(economic.paid), 0);
    assert.equal(economic.profit, null);
    const payment = (await f.db.query("SELECT * FROM payment_balances WHERE direction='customer'"))
      .rows[0];
    assert.equal(Number(payment.current_amount), 10000);
    assert.equal(Number(payment.allocated), 0);
    await assert.rejects(
      execute(f.db, employee, {
        ...request,
        id: randomUUID(),
        data: { ...request.data, sale: 10000 },
      }),
      /Permission required/,
    );
    await f.run('charge', {
      booking_id: booking.id,
      amount: 10000,
      kind: 'sale',
      date: '2026-10-29',
      reason: 'Authorized staff confirmed the actual customer charge',
    });
    await f.run('allocate', {
      payment_id: payment.id,
      booking_id: booking.id,
      amount: 10000,
      date: '2026-10-29',
    });
    assert.equal(Number((await economics(f.db, booking.id)).customer_balance), 0);
    const view = await detail(f.db, employee, 'booking', booking.id);
    assert.equal('sale' in view.booking, false);
    assert.deepEqual(view.sourceBalances, []);
  } finally {
    await f.db.close();
  }
});

test('paid fulfillment source/cost correction keeps actual receipts, reverses old expense and exposes separate source reconciliation', async () => {
  const f = await setup();
  try {
    const initial = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 70000,
      cost: 70000,
      source_id: f.provider.id,
      settled: true,
      payment_method: 'Card',
      account_id: f.card.id,
      date: '2026-10-29',
    });
    const oldPayment = (await f.db.query('SELECT * FROM payments')).rows[0];
    const data = {
      booking_id: f.booking.id,
      fulfillment_id: initial.id,
      expected_version: 0,
      travel_component_id: f.travel.id,
      mode: 'Cash/Card',
      unit: 'money',
      quantity: 60000,
      cost: 60000,
      source_id: f.broker.id,
      terms: { reference: 'CORRECTED-INVOICE' },
      date: '2026-11-01',
      reason: 'Source and exact invoice were entered incorrectly; preserve actual old card payment',
    };
    const key = randomUUID(),
      replacement = await f.run('revise_fulfillment', data, key);
    assert.equal((await f.run('revise_fulfillment', data, key)).id, replacement.id);
    const e = await economics(f.db, f.booking.id);
    assert.equal(Number(e.funding_cost), 60000);
    assert.equal(Number(e.profit), 40000);
    assert.equal(Number(e.sale), 100000);
    assert.equal(Number(e.customer_balance), 100000);
    assert.equal(Number(e.supplier_balance), -10000);
    assert.equal(
      Number((await supplierOutstanding(f.db, f.booking.id, f.provider.id)).amount),
      -70000,
    );
    assert.equal(
      Number((await supplierOutstanding(f.db, f.booking.id, f.broker.id)).amount),
      60000,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      1,
    );
    assert.equal(
      (await f.db.query('SELECT party_id FROM payments WHERE id=$1', [oldPayment.id])).rows[0]
        .party_id,
      f.provider.id,
    );
    const view = await detail(f.db, testOwner, 'booking', f.booking.id);
    assert.equal(view.fulfillments.find((x: any) => x.id === initial.id).status, 'Replaced');
    assert.equal(view.fulfillments.find((x: any) => x.id === replacement.id).status, 'Active');
    assert.equal(
      view.funding.find((x: any) => x.id === initial.funding_component_id).reversed,
      true,
    );
    assert.ok(
      (await snapshot(f.db, testOwner)).attention.some(
        (x) => x.key === `source-reconciliation:${f.booking.id}:${f.provider.id}`,
      ),
    );
    assert.equal(
      Number(
        (
          await f.db.query('SELECT cost FROM funding_components WHERE id=$1', [
            initial.funding_component_id,
          ])
        ).rows[0].cost,
      ),
      70000,
    );
    await assert.rejects(
      f.run('reverse_fulfillment', {
        booking_id: f.booking.id,
        fulfillment_id: initial.id,
        expected_version: 1,
        date: '2026-11-02',
        reason: 'Cannot undo twice',
      }),
      /active fulfillment/,
    );
    await f.run('payment', {
      party_id: f.broker.id,
      direction: 'supplier',
      amount: 60000,
      date: '2026-11-02',
      method: 'ACH',
      allocations: [{ booking_id: f.booking.id, amount: 60000 }],
    });
    assert.equal(Number((await supplierOutstanding(f.db, f.booking.id, f.broker.id)).amount), 0);
    const movements = (
      await f.db.query(
        "SELECT * FROM profit_movements WHERE booking_id=$1 AND effective_on='2026-11-01'",
        [f.booking.id],
      )
    ).rows;
    assert.equal(
      movements.reduce((s, m) => s + Number(m.amount), 0),
      10000,
    );
    assert.ok(
      view.activity.some((a: any) => a.kind === 'revise_fulfillment' && a.actor === testOwner.id),
    );
  } finally {
    await f.db.close();
  }
});

test('owned certificate correction restores exact original lot basis before replacement; descriptive edits and removal preserve all original rows', async () => {
  const f = await setup();
  try {
    const program = await f.run('program', {
      name: 'Correction certificate program',
      category: 'Hotel',
    });
    const instrument = await f.run('instrument', {
      program_id: program.id,
      name: 'Correction certificates',
      unit: 'count',
      role: 'Both',
    });
    const asset = await f.run('acquire_asset', {
      name: 'Three certificates',
      kind: 'Certificate',
      issuer: 'Synthetic',
      instrument_id: instrument.id,
      unit: 'count',
      quantity: 3,
      cost: 30000,
      date: '2026-10-29',
    });
    const initial = await f.run('fulfill', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Owned inventory',
      instrument_id: instrument.id,
      asset_id: asset.id,
      unit: 'count',
      quantity: 2,
      date: '2026-10-29',
    });
    const common = {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      mode: 'Owned inventory',
      instrument_id: instrument.id,
      asset_id: asset.id,
      unit: 'count',
      quantity: 2,
      date: '2026-10-30',
      reason: 'Correct fulfillment terms',
    };
    await f.run('revise_fulfillment', {
      ...common,
      fulfillment_id: initial.id,
      expected_version: 0,
      terms: { reference: 'DESCRIPTIVE-ONLY' },
    });
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM funding_components')).rows[0].count),
      1,
    );
    await assert.rejects(
      f.run('revise_fulfillment', { ...common, fulfillment_id: initial.id, expected_version: 0 }),
      /changed since/,
    );
    const replacement = await f.run('revise_fulfillment', {
      ...common,
      quantity: 1,
      fulfillment_id: initial.id,
      expected_version: 1,
    });
    let balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [asset.id]))
      .rows[0];
    assert.equal(Number(balance.balance), 2);
    assert.equal(Number(balance.remaining_basis), 20000);
    assert.equal(Number((await economics(f.db, f.booking.id)).funding_cost), 10000);
    const originalUse = (
      await f.db.query('SELECT * FROM funding_asset_uses WHERE funding_component_id=$1', [
        initial.funding_component_id,
      ])
    ).rows[0];
    assert.ok(
      (
        await f.db.query(
          "SELECT id FROM asset_movements WHERE kind='fulfillment_entry_reversal' AND original_movement_id=$1",
          [originalUse.movement_id],
        )
      ).rows.length,
    );
    await f.run('reverse_fulfillment', {
      booking_id: f.booking.id,
      fulfillment_id: replacement.id,
      expected_version: 0,
      date: '2026-10-31',
      reason: 'Remove incorrectly entered duplicate benefit',
    });
    assert.equal((await economics(f.db, f.booking.id)).profit, null);
    balance = (await f.db.query('SELECT * FROM asset_balances WHERE id=$1', [asset.id])).rows[0];
    assert.equal(Number(balance.balance), 3);
    assert.equal(Number(balance.remaining_basis), 30000);
    await f.run('confirm_travel_no_cost', {
      booking_id: f.booking.id,
      travel_component_id: f.travel.id,
      date: '2026-10-31',
      reason: 'This synthetic service is explicitly free after removal of erroneous funding',
    });
    assert.equal(Number((await economics(f.db, f.booking.id)).profit), 100000);
    const employee = await financialEmployee(f.db);
    await assert.rejects(
      execute(f.db, employee, {
        id: randomUUID(),
        kind: 'reverse_fulfillment',
        data: {
          booking_id: f.booking.id,
          fulfillment_id: replacement.id,
          expected_version: 0,
          date: '2026-10-31',
          reason: 'Denied',
        },
      }),
      /manage_funding/,
    );
    assert.equal(
      Number((await f.db.query('SELECT count(*) count FROM payments')).rows[0].count),
      0,
    );
  } finally {
    await f.db.close();
  }
});
