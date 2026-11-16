import { testOwner, financialDatabase, financialEmployee, declareNoSupplierCost } from './helpers';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { execute, economics, CommandKind } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';

let db: Database;
let fixtureCardId: string;
const date = '2026-10-01';
const cmd = (kind: CommandKind, data: unknown) =>
  execute(db, testOwner, { id: randomUUID(), kind, data });
before(async () => {
  db = await financialDatabase();
  fixtureCardId = (
    await cmd('payment_account', {
      name: 'Synthetic actual outflow card',
      kind: 'Card',
      ownership: 'Padova',
    })
  ).id;
});
after(async () => {
  await db.close();
});
async function party(name = 'Test person', kind = 'person') {
  return cmd('party', {
    name,
    kind,
    roles:
      kind === 'supplier'
        ? ['seller', 'airline']
        : kind === 'partner'
          ? ['seller']
          : kind === 'person'
            ? ['customer', 'traveler', 'seller']
            : ['customer'],
  });
}
async function setup(sale = 100000, kind = 'person') {
  const customer = await party('Synthetic customer', kind),
    supplier = await party('Synthetic supplier', 'supplier');
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'Synthetic journey',
    booked_on: date,
    travel_start: '2026-10-10',
    travel_end: '2026-10-12',
    sale,
  });
  return { customer, supplier, booking };
}
async function cashFund(booking_id: string, cost = 80000) {
  return cmd('fund', { booking_id, kind: 'Card', face_amount: cost, cost, date });
}
async function receipt(party_id: string, booking_id: string, amount: number) {
  return cmd('payment', {
    party_id,
    direction: 'customer',
    amount,
    date,
    method: 'ACH',
    allocations: [{ booking_id, amount }],
  });
}
async function asset(quantity = 100000, cost = 85000, kind = 'Voucher', extra = {}) {
  return cmd('acquire_asset', {
    name: 'Synthetic asset',
    kind,
    roles: ['customer', 'traveler', 'seller'],
    issuer: 'Test',
    quantity,
    cost,
    date,
    ...extra,
  });
}
async function check(booking_id: string, expected: Record<string, number | null>) {
  const b = await economics(db, booking_id);
  for (const [key, value] of Object.entries(expected))
    assert.equal(value === null ? b[key] : Number(b[key]), value, key);
  const journal = await one(db, 'SELECT COALESCE(sum(debit-credit),0) balance FROM journal_lines');
  assert.equal(Number(journal.balance), 0);
  const movement = await one(
    db,
    'SELECT COALESCE(sum(amount),0) amount FROM profit_movements WHERE booking_id=$1',
    [booking_id],
  );
  assert.equal(
    Number(movement.amount),
    b.cost_incomplete ? 0 : b.profit,
    'cumulative confirmed profit movement',
  );
  const audit = await one(db, 'SELECT count(*) count FROM audit_events WHERE record_id=$1', [
    booking_id,
  ]);
  assert.ok(Number(audit.count) > 0, 'audit exists');
  return b;
}
test('01 simple markup booking funded by card', async () => {
  const { booking } = await setup();
  await cashFund(booking.id);
  await check(booking.id, { profit: 20000, customer_balance: 100000, supplier_balance: 80000 });
});
test('date-only values stay date-only and new booking movements are not prior-period', async () => {
  const { booking } = await setup();
  const b = await economics(db, booking.id);
  assert.equal(b.booked_on, date);
  assert.equal(b.travel_start, '2026-10-10');
  assert.equal(b.profit, null, 'missing cost never books the sale as profit');
  await cashFund(booking.id);
  const m = await one(db, 'SELECT * FROM profit_movements WHERE booking_id=$1', [booking.id]);
  assert.equal(m.kind, 'booking_profit');
});
test('02 one customer payment allocated across several bookings', async () => {
  const { customer, booking } = await setup(300000);
  const b2 = await cmd('booking', {
    customer_id: customer.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Stay',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 400000,
  });
  const p = await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 700000,
    date,
    method: 'ACH',
    allocations: [
      { booking_id: booking.id, amount: 300000 },
      { booking_id: b2.id, amount: 400000 },
    ],
  });
  assert.equal(
    Number((await one(db, 'SELECT * FROM payment_balances WHERE id=$1', [p.id])).allocated),
    700000,
  );
  await check(b2.id, { customer_balance: 0, profit: null });
});
test('03 multiple payments against one booking', async () => {
  const { customer, booking } = await setup();
  await receipt(customer.id, booking.id, 40000);
  await receipt(customer.id, booking.id, 60000);
  await check(booking.id, { customer_balance: 0, paid: 100000 });
});
test('04 company pays several employee bookings', async () => {
  const { customer, booking } = await setup(30000, 'company');
  const employee = await party('Employee');
  await cmd('relationship', {
    person_id: employee.id,
    group_id: customer.id,
    relationship: 'employee',
  });
  const b = await cmd('booking', {
    customer_id: customer.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Employee stay',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 40000,
    traveler_ids: [employee.id],
  });
  await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 70000,
    date,
    method: 'ACH',
    allocations: [
      { booking_id: booking.id, amount: 30000 },
      { booking_id: b.id, amount: 40000 },
    ],
  });
  await check(b.id, { customer_balance: 0 });
});
test('05 purchased discounted hotel credit', async () => {
  const { booking } = await setup(110000);
  const a = await asset(100000, 80000, 'Hotel credit');
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Hotel credit',
    asset_id: a.id,
    face_amount: 100000,
    date,
  });
  await check(booking.id, { funding_cost: 80000, profit: 30000, supplier_balance: 0 });
  const balance = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(balance.remaining_basis), 0);
});
test('06 mixed voucher and card funding', async () => {
  const { booking } = await setup();
  const a = await asset(50000, 40000);
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Voucher',
    asset_id: a.id,
    face_amount: 50000,
    date,
  });
  await cashFund(booking.id, 30000);
  await check(booking.id, { funding_cost: 70000, profit: 30000 });
});
test('07 points plus cash booking', async () => {
  const { booking } = await setup(50000);
  const a = await asset(30000, 36000, 'Points');
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Points',
    asset_id: a.id,
    face_amount: 30000,
    date,
  });
  await cashFund(booking.id, 4000);
  await check(booking.id, { funding_cost: 40000, profit: 10000 });
});
test('08 Capital One credit creation and reuse does not duplicate income', async () => {
  const { booking } = await setup();
  await cashFund(booking.id, 100000);
  const a = await cmd('benefit', {
    booking_id: booking.id,
    name: 'Price match',
    amount: 40000,
    date,
  });
  await check(booking.id, { profit: 40000 });
  const b = await setup(50000);
  await cmd('fund', {
    booking_id: b.booking.id,
    kind: 'Capital One credit',
    asset_id: a.id,
    face_amount: 40000,
    date,
  });
  await check(b.booking.id, { profit: 10000, funding_cost: 40000 });
});
test('09 voucherization preserves source and creates no new profit', async () => {
  const { booking } = await setup();
  await cashFund(booking.id);
  const a = await cmd('voucherize', {
    booking_id: booking.id,
    name: 'Ticket voucher',
    quantity: 100000,
    basis: 0,
    date,
  });
  assert.equal(a.source_booking_id, booking.id);
  assert.equal(a.ownership, 'Customer');
  await check(booking.id, { profit: 20000 });
});
test('10 partial voucher use preserves remaining basis', async () => {
  const { booking } = await setup();
  const a = await asset();
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Voucher',
    asset_id: a.id,
    face_amount: 30000,
    date,
  });
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 70000);
  assert.equal(Number(b.remaining_basis), 59500);
  await check(booking.id, { profit: 74500 });
});
test('11 voucher sale posts proceeds, basis and gain', async () => {
  const buyer = await party();
  const a = await asset();
  const sale = await cmd('sell_asset', {
    asset_id: a.id,
    buyer_id: buyer.id,
    quantity: 40000,
    proceeds: 38000,
    date,
    paid: true,
  });
  assert.equal(Number(sale.basis), 34000);
  assert.ok(sale.payment_id);
  const m = await one(
    db,
    "SELECT * FROM profit_movements WHERE command_id=$1 AND kind='asset_gain_loss'",
    [sale.command_id],
  );
  assert.equal(Number(m.amount), 4000);
});
test('12 direct commission receipt', async () => {
  const { booking, supplier } = await setup(0);
  await declareNoSupplierCost(db, booking.id, date);
  const c = await cmd('commission', {
    booking_id: booking.id,
    payer_id: supplier.id,
    gross: 10000,
    due_on: date,
    date,
  });
  const p = await cmd('payment', {
    party_id: supplier.id,
    direction: 'commission',
    amount: 10000,
    date,
    method: 'ACH',
  });
  await cmd('commission_receipt', { commission_id: c.id, payment_id: p.id, amount: 10000, date });
  await check(booking.id, { profit: 10000, expected_commission: 10000 });
});
test('13 collecting agency retains ten percent', async () => {
  const { booking, supplier } = await setup(0),
    collector = await party('Collecting agency', 'partner');
  await declareNoSupplierCost(db, booking.id, date);
  const c = await cmd('commission', {
    booking_id: booking.id,
    payer_id: supplier.id,
    collector_id: collector.id,
    gross: 10000,
    retained: 1000,
    due_on: date,
    date,
  });
  const p = await cmd('payment', {
    party_id: collector.id,
    direction: 'commission',
    amount: 9000,
    date,
    method: 'ACH',
  });
  await cmd('commission_receipt', { commission_id: c.id, payment_id: p.id, amount: 9000, date });
  await check(booking.id, { profit: 9000 });
});
test('14 referral based on pre-referral Padova profit', async () => {
  const { booking } = await setup(85000);
  await cashFund(booking.id, 70000);
  const ref = await party('Referrer');
  await cmd('referral', {
    booking_id: booking.id,
    referrer_id: ref.id,
    basis: 'profit',
    rate_bps: 2000,
    due_on: date,
    date,
  });
  await check(booking.id, { referral_due: 3000, profit: 12000 });
});
test('15 customer pays supplier directly; commission remains separate', async () => {
  const { booking, supplier } = await setup(0);
  await declareNoSupplierCost(db, booking.id, date);
  await cmd('commission', {
    booking_id: booking.id,
    payer_id: supplier.id,
    gross: 10000,
    due_on: date,
    date,
  });
  await check(booking.id, { customer_balance: 0, supplier_balance: 0, profit: 10000 });
});
test('16 cancellation tracks supplier and customer refunds separately', async () => {
  const { booking, customer } = await setup(90000);
  await cashFund(booking.id, 80000);
  await receipt(customer.id, booking.id, 90000);
  const r = await cmd('cancel', {
    booking_id: booking.id,
    supplier_expected: 80000,
    customer_due: 90000,
    due_on: date,
    date,
    reason: 'Cancelled',
  });
  await assert.rejects(
    () => cmd('pay_refund', { refund_id: r.id, amount: 90000, date, method: 'ACH' }),
    /Wait/,
  );
  await cmd('receive_refund', { refund_id: r.id, amount: 80000, form: 'cash', date });
  await cmd('pay_refund', { refund_id: r.id, amount: 90000, date, method: 'ACH' });
  await check(booking.id, { profit: 0, customer_balance: 0 });
});
test('17 points returned restore exact original basis', async () => {
  const { booking } = await setup(0),
    a = await asset(30000, 36000, 'Points');
  const f = await cmd('fund', {
    booking_id: booking.id,
    kind: 'Points',
    asset_id: a.id,
    face_amount: 30000,
    date,
  });
  const r = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: f.id,
    supplier_expected: 30000,
    customer_due: 0,
    due_on: date,
    date,
    reason: 'Award cancelled',
  });
  await cmd('receive_refund', {
    refund_id: r.id,
    amount: 30000,
    form: 'points',
    asset_id: a.id,
    original_movement_id: f.asset_movement_id,
    date,
  });
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 30000);
  assert.equal(Number(b.remaining_basis), 36000);
  await check(booking.id, { profit: 0 });
});
test('18 payment correction preserves original and adds delta', async () => {
  const { customer, booking } = await setup();
  const p = await receipt(customer.id, booking.id, 90000);
  await cmd('correct_payment', {
    payment_id: p.id,
    amount: 95000,
    date,
    reason: 'Entry correction',
  });
  const b = await one(db, 'SELECT * FROM payment_balances WHERE id=$1', [p.id]);
  assert.equal(Number(b.amount), 90000);
  assert.equal(Number(b.current_amount), 95000);
  assert.equal(Number(b.current_amount) - Number(b.allocated), 5000);
  await check(booking.id, { customer_balance: 10000 });
});
test('19 old booking changed in later accounting month', async () => {
  const { booking } = await setup();
  await cashFund(booking.id);
  await cmd('charge', {
    booking_id: booking.id,
    amount: -8000,
    kind: 'Price correction',
    date: '2026-12-01',
  });
  await check(booking.id, { profit: 12000 });
  const m = await one(
    db,
    "SELECT sum(amount) amount FROM profit_movements WHERE booking_id=$1 AND effective_on='2026-12-01' AND kind='prior_period_adjustment'",
    [booking.id],
  );
  assert.equal(Number(m.amount), -8000);
});
test('20 several simultaneous funding components', async () => {
  const { booking } = await setup(100000);
  const a = await asset(50000, 40000),
    p = await asset(20000, 24000, 'Points');
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Voucher',
    asset_id: a.id,
    face_amount: 50000,
    date,
  });
  await cashFund(booking.id, 30000);
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Points',
    asset_id: p.id,
    face_amount: 20000,
    date,
  });
  await check(booking.id, { funding_cost: 94000, profit: 6000 });
});
test('21 discounted credit plus taxes plus commission', async () => {
  const { booking, supplier } = await setup(110000);
  const a = await asset(100000, 80000, 'Hotel credit');
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Hotel credit',
    asset_id: a.id,
    face_amount: 100000,
    date,
  });
  await cashFund(booking.id, 4000);
  await cmd('commission', {
    booking_id: booking.id,
    payer_id: supplier.id,
    gross: 10000,
    due_on: date,
    date,
  });
  await check(booking.id, { funding_cost: 84000, profit: 36000 });
});
test('22 partial cancellation retains same booking and active traveler', async () => {
  const p1 = await party('Traveler one'),
    p2 = await party('Traveler two'),
    customer = await party();
  const b = await cmd('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'GDS',
    summary: 'Family flight',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    traveler_ids: [p1.id, p2.id],
    sale: 100000,
  });
  await receipt(customer.id, b.id, 100000);
  await cmd('cancel', {
    booking_id: b.id,
    traveler_id: p1.id,
    supplier_expected: 0,
    customer_due: 40000,
    due_on: date,
    date,
    reason: 'One traveler cancelled',
  });
  const active = await one(
    db,
    "SELECT count(*) count FROM booking_travelers WHERE booking_id=$1 AND status='Active'",
    [b.id],
  );
  assert.equal(Number(active.count), 1);
  await check(b.id, { sale: 60000, profit: null });
});
test('23 one supplier payment across multiple bookings', async () => {
  const account = await cmd('payment_account', {
    name: 'Synthetic settlement card',
    kind: 'Card',
    ownership: 'Padova',
  });
  const { booking, customer, supplier } = await setup();
  const b = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Hotel',
    channel: 'Direct',
    summary: 'Another',
    booked_on: date,
    travel_start: date,
    travel_end: date,
  });
  await cashFund(booking.id, 30000);
  await cashFund(b.id, 40000);
  await cmd('payment', {
    party_id: supplier.id,
    direction: 'supplier',
    amount: 70000,
    date,
    method: 'Card',
    account_id: account.id,
    allocations: [
      { booking_id: booking.id, amount: 30000 },
      { booking_id: b.id, amount: 40000 },
    ],
  });
  await check(booking.id, { supplier_balance: 0 });
  await check(b.id, { supplier_balance: 0 });
});
test('24 customer overpayment remains usable credit', async () => {
  const { booking, customer } = await setup(90000);
  const p = await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 100000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: booking.id, amount: 90000 }],
  });
  const b = await cmd('booking', {
    customer_id: customer.id,
    product: 'Car',
    channel: 'Direct',
    summary: 'Car',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 10000,
  });
  await cmd('allocate', { payment_id: p.id, booking_id: b.id, amount: 10000, date });
  await check(b.id, { customer_balance: 0 });
});
test('25 refund returned as travel credit is not cash', async () => {
  const { booking, customer } = await setup();
  await cashFund(booking.id);
  await receipt(customer.id, booking.id, 100000);
  const r = await cmd('cancel', {
    booking_id: booking.id,
    supplier_expected: 80000,
    customer_due: 100000,
    due_on: date,
    date,
    reason: 'Credit instead of cash',
  });
  const a = await asset(80000, 80000, 'Airline credit', { source_booking_id: booking.id });
  await cmd('receive_refund', {
    refund_id: r.id,
    amount: 80000,
    asset_id: a.id,
    form: 'Airline credit',
    basis: 80000,
    date,
  });
  await assert.rejects(
    () => cmd('pay_refund', { refund_id: r.id, amount: 100000, date, method: 'ACH' }),
    /Wait/,
  );
  await check(booking.id, { profit: 0, customer_balance: -100000 });
});
test('invalid commands roll back; overuse, double allocation and destructive changes fail', async () => {
  const { booking, customer } = await setup();
  const a = await asset(10000, 8500);
  await assert.rejects(
    () =>
      cmd('fund', {
        booking_id: booking.id,
        asset_id: a.id,
        kind: 'Voucher',
        face_amount: 20000,
        date,
      }),
    /Insufficient/,
  );
  const balance = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(balance.balance), 10000);
  const p = await receipt(customer.id, booking.id, 10000);
  await assert.rejects(
    () => cmd('allocate', { payment_id: p.id, booking_id: booking.id, amount: 10000, date }),
    /exceeds payment/,
  );
  await assert.rejects(
    () => db.query('DELETE FROM payments WHERE id=$1', [p.id]),
    /immutable|cannot delete from view|permission denied/,
  );
  assert.equal((await db.query('SELECT id FROM payments WHERE id=$1', [p.id])).rows.length, 1);
});
test('idempotent retries cannot change command payload', async () => {
  const key = randomUUID();
  const data = { name: 'Retry', kind: 'person', roles: ['customer', 'traveler', 'seller'] };
  const a = await execute(db, testOwner, { id: key, kind: 'party', data });
  const b = await execute(db, testOwner, { id: key, kind: 'party', data });
  assert.equal(a.id, b.id);
  await assert.rejects(
    () => execute(db, testOwner, { id: key, kind: 'party', data: { ...data, name: 'Changed' } }),
    /Idempotency/,
  );
});
test('server permissions hide cost, profit, and traveler secrets', async () => {
  const staff = await financialEmployee(db);
  await assert.rejects(
    () => execute(db, staff, { id: randomUUID(), kind: 'acquire_asset', data: {} }),
    /Permission/,
  );
  const s = await snapshot(db, staff);
  assert.equal(s.movements.length, 0);
  assert.equal(s.assets.length, 0);
  for (const b of s.bookings) {
    assert.equal(b.profit, undefined);
    assert.equal(b.funding_cost, undefined);
  }
  const b = s.bookings[0];
  const d = await detail(db, staff, 'booking', b.id);
  assert.equal(d.booking.profit, undefined);
  assert.equal(d.funding.length, 0);
});
test('concurrent asset use cannot overspend inventory', async () => {
  const { booking } = await setup();
  const a = await asset(10000, 8500);
  const results = await Promise.allSettled([
    cmd('fund', {
      booking_id: booking.id,
      asset_id: a.id,
      kind: 'Voucher',
      face_amount: 7000,
      date,
    }),
    cmd('fund', {
      booking_id: booking.id,
      asset_id: a.id,
      kind: 'Voucher',
      face_amount: 7000,
      date,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 3000);
});

test('operating model: atomic multi-component booking, versioned itinerary and duplicate-safe replay', async () => {
  const customer = await party('Composer customer');
  const supplier = await party('Composer airline', 'supplier');
  const seller = await party('Voucher seller', 'partner');
  const voucher = await asset(100000, 80000, 'Voucher', { seller_id: seller.id });
  const credit = await asset(20000, 20000, 'Capital One credit');
  const request = {
    id: randomUUID(),
    kind: 'booking' as const,
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Flight + Hotel',
      channel: 'Capital One',
      summary: 'Composer journey',
      booked_on: date,
      travel_start: '2026-11-01',
      travel_end: '2026-11-05',
      sale: 100000,
      customer_payment: {
        amount: 100000,
        date,
        method: 'Zelle',
        reference: 'Synthetic composer receipt',
      },
      traveler_ids: [customer.id],
      confirmations: ['PNR123', 'HOTEL123'],
      itinerary: {
        origin: 'JFK',
        destination: 'LHR',
        airline_id: supplier.id,
        acquisition_source_id: seller.id,
        flight_numbers: ['UA100'],
        ticket_numbers: ['0160000000001'],
        hotel_name: 'Synthetic Hotel',
        room_type: 'King',
      },
      funding: [
        {
          kind: 'Card',
          face_amount: 30000,
          cost: 30000,
          settled: true,
          account_id: fixtureCardId,
          date,
        },
        { kind: 'Voucher', asset_id: voucher.id, face_amount: 50000, date },
        { kind: 'Capital One credit', asset_id: credit.id, face_amount: 20000, date },
      ],
    },
  };
  const booking = await execute(db, testOwner, request);
  assert.equal((await execute(db, testOwner, request)).id, booking.id);
  await check(booking.id, {
    funding_cost: 90000,
    customer_balance: 0,
    supplier_paid: 30000,
    supplier_balance: 0,
    profit: 10000,
  });
  const balance = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [voucher.id]);
  assert.equal(Number(balance.balance), 50000);
  assert.equal(Number(balance.remaining_basis), 40000);
  const counts = await one(
    db,
    'SELECT count(*) count FROM funding_components WHERE booking_id=$1',
    [booking.id],
  );
  assert.equal(Number(counts.count), 3);
  const saved = await one(db, 'SELECT * FROM bookings WHERE id=$1', [booking.id]);
  assert.equal(saved.itinerary.airline_id, supplier.id);
  await cmd('revise', {
    booking_id: booking.id,
    summary: 'Revised route',
    travel_start: '2026-11-02',
    travel_end: '2026-11-06',
    date,
    reason: 'Airline schedule change',
    itinerary: { ...saved.itinerary, flight_numbers: ['UA102'] },
  });
  const versions = (
    await db.query('SELECT * FROM itinerary_revisions WHERE booking_id=$1 ORDER BY revision', [
      booking.id,
    ])
  ).rows;
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0].snapshot.itinerary.flight_numbers, ['UA100']);
  assert.deepEqual(versions[1].snapshot.itinerary.flight_numbers, ['UA102']);
  const before = await one(db, 'SELECT count(*) count FROM bookings');
  await assert.rejects(
    execute(db, testOwner, {
      ...request,
      id: randomUUID(),
      data: {
        ...request.data,
        funding: [
          request.data.funding[0],
          { kind: 'Voucher', asset_id: voucher.id, face_amount: 99999999, date },
        ],
      },
    }),
  );
  assert.equal(
    (await one(db, 'SELECT count(*) count FROM bookings')).count,
    before.count,
    'failed component rolls back entire booking',
  );
  assert.equal(
    Number((await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [voucher.id])).balance),
    50000,
  );
  await assert.rejects(
    execute(db, await financialEmployee(db), {
      ...request,
      id: randomUUID(),
      data: { ...request.data, sale: 0 },
    }),
    /Permission required: manage_funding/,
  );
});

test('operating model F: exact 790.60 PM chain carries 197.92 basis into reuse without duplicate benefit', async () => {
  const { customer, supplier } = await setup(0);
  const existing = await asset(17808, 17808, 'Capital One credit');
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Capital One',
    summary: 'Exact PM example',
    booked_on: date,
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    sale: 79060,
    funding: [
      {
        kind: 'Card',
        face_amount: 61252,
        account_id: fixtureCardId,
        cost: 61252,
        seller_id: supplier.id,
        settled: true,
        date,
      },
      { kind: 'Capital One credit', asset_id: existing.id, face_amount: 17808, date },
    ],
  });
  const earned = await cmd('benefit', {
    booking_id: booking.id,
    name: 'Approved price-match credit',
    amount: 19792,
    date,
  });
  const first = await check(booking.id, {
    funding_cost: 79060,
    profit: 19792,
    supplier_balance: 0,
  });
  assert.equal(
    first.funding_cost - 19792,
    59268,
    'final economic cost after newly generated benefit',
  );
  assert.equal(
    Number(
      (await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [earned.id])).remaining_basis,
    ),
    19792,
  );
  const second = await setup(22000);
  await cmd('fund', {
    booking_id: second.booking.id,
    kind: 'Capital One credit',
    asset_id: earned.id,
    face_amount: 19792,
    date,
  });
  await check(second.booking.id, { funding_cost: 19792, profit: 2208 });
  const benefits = await one(
    db,
    "SELECT COALESCE(sum(amount),0) amount FROM profit_movements WHERE booking_id=$1 AND kind='earned_credit'",
    [second.booking.id],
  );
  assert.equal(Number(benefits.amount), 0);
});

test('unknown cost stays unknown and cannot book sale as profit until explicitly confirmed', async () => {
  const { customer, supplier } = await setup(0);
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct Airline',
    summary: 'Awaiting cost',
    booked_on: date,
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    sale: 100000,
    itinerary: { cost_status: 'Pending' },
  });
  assert.equal((await economics(db, booking.id)).profit, null);
  assert.equal(
    Number(
      (
        await one(
          db,
          'SELECT COALESCE(sum(amount),0) amount FROM profit_movements WHERE booking_id=$1',
          [booking.id],
        )
      ).amount,
    ),
    0,
  );
  const change = {
    booking_id: booking.id,
    summary: 'Confirmed cost',
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    date,
    reason: 'Cost verified',
    itinerary: { cost_status: 'Confirmed' },
  };
  await assert.rejects(cmd('revise', change), /Record the funding/);
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 80000,
    cost: 80000,
    date,
    confirm_cost: false,
  });
  assert.equal(
    (await economics(db, booking.id)).profit,
    null,
    'partial funding alone does not assert completeness',
  );
  await assert.rejects(
    execute(db, await financialEmployee(db), { id: randomUUID(), kind: 'revise', data: change }),
    /Permission required: manage_funding/,
  );
  await cmd('revise', change);
  await check(booking.id, { profit: 20000 });
  await assert.rejects(
    cmd('revise', { ...change, itinerary: { cost_status: 'Pending' } }),
    /silently changed/,
  );
  await assert.rejects(
    cmd('revise', { ...change, itinerary: { cost_status: 'No supplier cost' } }),
    /conflicts/,
  );
});

test('operating model L: change preserves fare difference, supplier fee, Padova fee and customer total separately', async () => {
  const { booking } = await setup(100000);
  await cashFund(booking.id, 80000);
  const request = {
    id: randomUUID(),
    kind: 'revise' as const,
    data: {
      booking_id: booking.id,
      summary: 'Changed flight',
      travel_start: '2026-11-01',
      travel_end: '2026-11-02',
      date: '2026-12-01',
      reason: 'Passenger requested new flight',
      fare_difference: 10000,
      supplier_change_fee: 2500,
      padova_change_fee: 5000,
      additional_customer_charge: 17500,
      itinerary: {},
    },
  };
  await execute(db, testOwner, request);
  await execute(db, testOwner, request);
  await check(booking.id, {
    sale: 117500,
    funding_cost: 92500,
    profit: 25000,
    supplier_balance: 92500,
  });
  const charges = (
    await db.query('SELECT kind,amount FROM charges WHERE command_id=$1 ORDER BY kind', [
      request.id,
    ])
  ).rows;
  assert.deepEqual(
    charges.map((r) => [r.kind, Number(r.amount)]),
    [
      ['Change fare / customer adjustment', 12500],
      ['Padova change fee', 5000],
    ],
  );
  const funding = (
    await db.query('SELECT kind,cost FROM funding_components WHERE command_id=$1 ORDER BY kind', [
      request.id,
    ])
  ).rows;
  assert.deepEqual(
    funding.map((r) => [r.kind, Number(r.cost)]),
    [
      ['Fare difference', 10000],
      ['Supplier change fee', 2500],
    ],
  );
  assert.equal(
    Number(
      (
        await one(
          db,
          "SELECT sum(amount) amount FROM profit_movements WHERE command_id=$1 AND kind='prior_period_adjustment'",
          [request.id],
        )
      ).amount,
    ),
    5000,
  );
  await assert.rejects(
    execute(db, await financialEmployee(db), { ...request, id: randomUUID() }),
    /Permission required: manage_funding/,
  );
  await assert.rejects(
    cmd('revise', { ...request.data, additional_customer_charge: 4000 }),
    /must include the Padova fee/,
  );
});

test('one commission receipt atomically settles multiple net commissions, with counterparty and replay protection', async () => {
  const first = await setup(0),
    second = await setup(0);
  await declareNoSupplierCost(db, first.booking.id, date);
  await declareNoSupplierCost(db, second.booking.id, date);
  const collector = await party('Synthetic collecting agency', 'company');
  const c1 = await cmd('commission', {
    booking_id: first.booking.id,
    payer_id: first.supplier.id,
    collector_id: collector.id,
    gross: 10000,
    retained: 1000,
    due_on: date,
    date,
  });
  const c2 = await cmd('commission', {
    booking_id: second.booking.id,
    payer_id: second.supplier.id,
    collector_id: collector.id,
    gross: 20000,
    retained: 2000,
    due_on: date,
    date,
  });
  const request = {
    id: randomUUID(),
    kind: 'payment' as const,
    data: {
      direction: 'commission',
      party_id: collector.id,
      amount: 27000,
      method: 'ACH',
      date,
      commission_allocations: [
        { commission_id: c1.id, amount: 9000 },
        { commission_id: c2.id, amount: 18000 },
      ],
    },
  };
  const receipt = await execute(db, testOwner, request);
  assert.equal((await execute(db, testOwner, request)).id, receipt.id);
  const balance = await one(db, 'SELECT * FROM payment_balances WHERE id=$1', [receipt.id]);
  assert.equal(Number(balance.commission_allocated), 27000);
  await check(first.booking.id, { profit: 9000 });
  await check(second.booking.id, { profit: 18000 });
  const before = await one(db, 'SELECT count(*) count FROM payments');
  await assert.rejects(
    execute(db, testOwner, {
      ...request,
      id: randomUUID(),
      data: { ...request.data, party_id: first.supplier.id },
    }),
    /Invalid commission receipt/,
  );
  assert.equal((await one(db, 'SELECT count(*) count FROM payments')).count, before.count);
});

test('price-match attempts/approval are history only; verified credit checks rates, provenance and permission redaction', async () => {
  const { booking } = await setup(79060);
  await cashFund(booking.id, 79060);
  await cmd('price_match_event', {
    booking_id: booking.id,
    status: 'Pending',
    original_rate: 79060,
    final_rate: 59268,
    date,
    reference: 'SYNTHETIC-PM-CASE',
    reason: 'Request submitted, not yet usable',
  });
  await check(booking.id, { profit: 0 });
  const beforeAssets = await one(db, 'SELECT count(*) count FROM assets');
  await cmd('price_match_event', {
    booking_id: booking.id,
    status: 'Approved',
    date,
    reference: 'SYNTHETIC-PM-CASE',
    reason: 'Approved but credit not visible yet',
  });
  assert.equal((await one(db, 'SELECT count(*) count FROM assets')).count, beforeAssets.count);
  await assert.rejects(
    cmd('benefit', {
      booking_id: booking.id,
      name: 'Wrong arithmetic',
      amount: 19791,
      original_rate: 79060,
      final_rate: 59268,
      date,
    }),
    /must equal/,
  );
  const earned = await cmd('benefit', {
    booking_id: booking.id,
    name: 'Verified available',
    amount: 19792,
    original_rate: 79060,
    final_rate: 59268,
    date,
    reference: 'SYNTHETIC-PM-CASE',
  });
  await check(booking.id, { profit: 19792, net_economic_cost: 59268 });
  await assert.rejects(
    cmd('benefit', {
      booking_id: booking.id,
      name: 'Duplicate case',
      amount: 19792,
      date,
      reference: 'SYNTHETIC-PM-CASE',
    }),
    /already created/,
  );
  const saved = await one(db, 'SELECT * FROM bookings WHERE id=$1', [booking.id]);
  assert.equal(saved.itinerary.price_match_history.length, 3);
  assert.equal(saved.itinerary.price_match_history[2].asset_id, earned.id);
  await cmd('revise', {
    booking_id: booking.id,
    summary: 'Operational update',
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    date,
    reason: 'Schedule change',
    itinerary: {},
  });
  assert.equal(
    (await one(db, 'SELECT * FROM bookings WHERE id=$1', [booking.id])).itinerary
      .price_match_history.length,
    3,
    'operational edit preserves protected history',
  );
  const employee = await financialEmployee(db);
  const response = await detail(db, employee, 'booking', booking.id);
  assert.equal(response.booking.itinerary.price_match_history, undefined);
  assert.equal(response.booking.net_economic_cost, undefined);
  for (const revision of response.revisions)
    assert.equal(revision.snapshot.itinerary.price_match_history, undefined);
  await assert.rejects(
    execute(db, employee, {
      id: randomUUID(),
      kind: 'price_match_event',
      data: { booking_id: booking.id, status: 'Denied', date, reason: 'Unauthorized update' },
    }),
    /Permission required/,
  );
});

test('Padova credit-to-voucher conversion preserves full basis and original source without a second benefit or payable', async () => {
  const original = await setup(100000);
  await cashFund(original.booking.id, 100000);
  const credit = await cmd('benefit', {
    booking_id: original.booking.id,
    name: 'Original earned credit',
    amount: 30000,
    date,
  });
  const request = {
    id: randomUUID(),
    kind: 'convert_asset' as const,
    data: {
      asset_id: credit.id,
      name: 'Converted voucher',
      kind: 'Voucher',
      issuer: 'Synthetic airline',
      quantity_sent: 30000,
      quantity_received: 30000,
      date,
      reason: 'Issuer converted the same value',
    },
  };
  const voucher = await execute(db, testOwner, request);
  assert.equal((await execute(db, testOwner, request)).id, voucher.id);
  assert.equal(voucher.source_booking_id, original.booking.id);
  assert.equal(voucher.seller_id, null, 'conversion does not create another purchase counterparty');
  await check(original.booking.id, { profit: 30000 });
  assert.equal(
    Number((await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [credit.id])).balance),
    0,
  );
  const remaining = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [voucher.id]);
  assert.equal(Number(remaining.balance), 30000);
  assert.equal(Number(remaining.remaining_basis), 30000);
  assert.equal(
    Number(
      (await one(db, 'SELECT count(*) count FROM journal_lines WHERE command_id=$1', [request.id]))
        .count,
    ),
    0,
  );
  const use = await setup(40000);
  await cmd('fund', {
    booking_id: use.booking.id,
    kind: 'Voucher',
    asset_id: voucher.id,
    face_amount: 30000,
    date,
  });
  await check(use.booking.id, { profit: 10000, funding_cost: 30000 });
  const customerOwned = await asset(10000, 0, 'Voucher', {
    ownership: 'Customer',
    holder_id: use.customer.id,
  });
  await assert.rejects(
    cmd('convert_asset', {
      ...request.data,
      asset_id: customerOwned.id,
      quantity_sent: 10000,
      quantity_received: 10000,
    }),
    /Only Padova-owned/,
  );
});

test('unpaid cancellation credits charges and supplier payable without inventing receipts, cash refunds or assets', async () => {
  const { booking, supplier } = await setup(100000);
  await cashFund(booking.id, 80000);
  const component = await one(db, 'SELECT * FROM funding_components WHERE booking_id=$1', [
    booking.id,
  ]);
  const paymentsBefore = await one(db, 'SELECT count(*) count FROM payments');
  const assetsBefore = await one(db, 'SELECT count(*) count FROM assets');
  const refund = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: component.id,
    supplier_expected: 80000,
    customer_due: 0,
    charge_reduction: 100000,
    date,
    due_on: date,
    reason: 'Cancelled before either side paid',
  });
  await cmd('receive_refund', {
    refund_id: refund.id,
    form: 'Supplier payable credit',
    amount: 80000,
    date,
  });
  await check(booking.id, { sale: 0, customer_balance: 0, supplier_balance: 0, profit: 0 });
  assert.equal((await one(db, 'SELECT count(*) count FROM payments')).count, paymentsBefore.count);
  assert.equal((await one(db, 'SELECT count(*) count FROM assets')).count, assetsBefore.count);
  const state = await snapshot(db, testOwner);
  assert.ok(
    !state.attention.some((a: any) => a.booking_id === booking.id && a.kind !== 'Traveler missing'),
    'settled cancellation needs no fake refund or supplier payment',
  );
  await assert.rejects(
    cmd('payment', {
      party_id: supplier.id,
      direction: 'supplier',
      amount: 1,
      date,
      method: 'ACH',
      allocations: [{ booking_id: booking.id, amount: 1 }],
    }),
    /obligation allocation mismatch/,
  );
  await assert.rejects(
    cmd('cancel', {
      booking_id: booking.id,
      funding_component_id: component.id,
      supplier_expected: 0,
      customer_due: 1,
      charge_reduction: 0,
      date,
      due_on: date,
      reason: 'Invalid unpaid customer refund',
    }),
    /actual allocated payments/,
  );
});

test('corporate purchasing Tier and comfort Level are independent defaults and per-company employee assignments', async () => {
  const company = await cmd('party', {
    name: 'Synthetic corporate policy',
    kind: 'company',
    roles: ['customer'],
    details: { corporate_policy: { tier: '1', comfort_level: 'A' } },
  });
  const employee = await party('Synthetic corporate traveler');
  const assignment = {
    person_id: employee.id,
    group_id: company.id,
    relationship: 'employee',
    tier: '2',
    comfort_level: 'B',
  };
  await cmd('relationship', assignment);
  await cmd('relationship', { ...assignment, tier: '3' });
  const person = await one(db, 'SELECT * FROM parties WHERE id=$1', [employee.id]);
  assert.deepEqual(person.details.company_policies[company.id], { tier: '3', comfort_level: 'B' });
  assert.equal(
    Number(
      (
        await one(
          db,
          'SELECT count(*) count FROM party_relationships WHERE person_id=$1 AND group_id=$2',
          [employee.id, company.id],
        )
      ).count,
    ),
    1,
  );
  assert.deepEqual(
    (await one(db, 'SELECT * FROM parties WHERE id=$1', [company.id])).details.corporate_policy,
    { tier: '1', comfort_level: 'A' },
  );
  const family = await party('Synthetic family', 'family');
  await assert.rejects(
    cmd('relationship', { ...assignment, group_id: family.id }),
    /require a company/,
  );
  await assert.rejects(
    cmd('party', {
      name: 'Invalid policy',
      kind: 'company',
      roles: ['customer', 'seller'],
      details: { corporate_policy: { tier: 'B', comfort_level: '2' } },
    }),
  );
  assert.ok(
    Number(
      (await one(db, 'SELECT count(*) count FROM audit_events WHERE record_id=$1', [employee.id]))
        .count,
    ) >= 2,
  );
});

test('third-party acquisition is distinct from airline: payable, settlement and cash return follow the actual seller', async () => {
  const customer = await party('Synthetic acquisition customer'),
    airline = await party('Synthetic travel airline', 'supplier');
  const seller = await cmd('party', {
    name: 'Synthetic one-off seller',
    kind: 'person',
    roles: ['seller'],
    phone: '+1 202 555 0108',
    details: { whatsapp: '+1 202 555 0108' },
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: airline.id,
    product: 'Flight',
    channel: 'Another Agency',
    summary: 'Discounted acquisition',
    booked_on: date,
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    sale: 120000,
    itinerary: { acquisition_source_id: seller.id },
    funding: [
      { kind: 'Seller-funded reservation', face_amount: 100000, cost: 80000, settled: true, date },
    ],
  });
  const obligation = await one(db, 'SELECT * FROM supplier_obligations WHERE booking_id=$1', [
    booking.id,
  ]);
  assert.equal(obligation.supplier_id, seller.id);
  assert.equal(
    (await one(db, 'SELECT * FROM bookings WHERE id=$1', [booking.id])).supplier_id,
    airline.id,
  );
  await check(booking.id, { funding_cost: 80000, profit: 40000, supplier_balance: 0 });
  const component = await one(db, 'SELECT * FROM funding_components WHERE booking_id=$1', [
    booking.id,
  ]);
  assert.equal(component.seller_id, seller.id);
  const refund = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: component.id,
    supplier_expected: 80000,
    customer_due: 0,
    charge_reduction: 120000,
    due_on: date,
    date,
    reason: 'Return to source before customer paid',
  });
  await cmd('receive_refund', {
    refund_id: refund.id,
    amount: 80000,
    form: 'cash',
    method: 'ACH',
    date,
  });
  const returned = await one(
    db,
    "SELECT * FROM payments WHERE direction='supplier_refund' AND party_id=$1 ORDER BY created_at DESC LIMIT 1",
    [seller.id],
  );
  assert.equal(returned.party_id, seller.id);
  await check(booking.id, { sale: 0, customer_balance: 0, profit: 0 });
});

test('historical original fields and notes survive operational edits and stay Owner-only, including revision snapshots', async () => {
  const customer = await party('Synthetic source customer');
  const sources = [
    {
      workbook_id: 'synthetic-workbook',
      workbook_title: 'Synthetic accounting source',
      tab: 'Bookings',
      row: 12,
      snapshot_id: 'synthetic-snapshot',
      evidence_ids: [randomUUID()],
      original_fields: {
        'A — original name': 'Original synthetic alias',
        'D — sale': { userEnteredValue: { numberValue: 100 }, formattedValue: '100.00' },
        'S — notes': 'First original note\nSecond original line',
        'unknown future acquisition field': 'Preserve this exact detail',
      },
    },
  ];
  const booking = await cmd('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Other channel',
    summary: 'Synthetic historical visibility case',
    booked_on: date,
    travel_start: '2026-11-01',
    travel_end: '2026-11-02',
    sale: 0,
    itinerary: { historical_sources: sources },
  });
  const owner = await detail(db, testOwner, 'booking', booking.id);
  assert.deepEqual(owner.booking.itinerary.historical_sources, sources);
  const change = {
    booking_id: booking.id,
    summary: 'Operational edit preserves evidence',
    travel_start: '2026-11-02',
    travel_end: '2026-11-03',
    date,
    reason: 'Schedule update',
    itinerary: {},
  };
  await cmd('revise', change);
  assert.deepEqual(
    (await detail(db, testOwner, 'booking', booking.id)).booking.itinerary.historical_sources,
    sources,
  );
  await assert.rejects(
    cmd('revise', { ...change, itinerary: { historical_sources: [] } }),
    /cannot be overwritten/,
  );
  const employee = await financialEmployee(db),
    visible = await detail(db, employee, 'booking', booking.id);
  assert.equal(visible.booking.itinerary.historical_sources, undefined);
  for (const revision of visible.revisions)
    assert.equal(revision.snapshot.itinerary.historical_sources, undefined);
});
