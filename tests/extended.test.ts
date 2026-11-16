import { testOwner, financialDatabase, declareNoSupplierCost } from './helpers';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { execute, economics, CommandKind } from '../src/lib/finance';
import { detail, snapshot } from '../src/lib/queries';
let db: Database;
const date = '2026-10-01';
const cmd = (kind: CommandKind, data: unknown) =>
  execute(db, testOwner, { id: randomUUID(), kind, data });
before(async () => {
  db = await financialDatabase();
});
after(async () => {
  await db.close();
});
const party = (name = 'Synthetic person', kind = 'person') =>
  cmd('party', { name, kind, roles: ['customer', 'traveler', 'seller'] });
test('task follow-ups retain links and history through edits, completion and reopening', async () => {
  const person = await party('Task-linked traveler');
  await assert.rejects(
    () => cmd('task', { title: 'Invalid link', record_type: 'party', record_id: randomUUID() }),
    /does not exist/,
  );
  await assert.rejects(() => cmd('task', { title: 'Partial link', record_type: 'party' }), /both/);
  await assert.rejects(
    () => cmd('task', { title: 'Missing assignee', assignee_id: randomUUID() }),
    /active staff/,
  );
  const task = await cmd('task', {
    title: 'Confirm traveler details',
    record_type: 'party',
    record_id: person.id,
    due_on: date,
  });
  const edited = await cmd('update_task', {
    task_id: task.id,
    title: 'Confirm updated details',
    record_type: 'party',
    record_id: person.id,
    due_on: '2026-10-04',
    priority: 'High',
    status: 'Open',
    reason: 'Traveler requested a later follow-up',
  });
  assert.equal(edited.priority, 'High');
  await cmd('complete_task', { task_id: task.id, note: 'Traveler details verified' });
  const reopened = await cmd('update_task', {
    task_id: task.id,
    title: edited.title,
    status: 'Open',
    reason: 'Traveler has another update',
  });
  assert.equal(reopened.status, 'Open');
  assert.equal(
    reopened.record_id,
    null,
    'Explicitly clearing a link must not retain the old relationship',
  );
  assert.equal(
    Number(
      (
        await one(
          db,
          "SELECT count(*) count FROM notes WHERE record_type='task' AND record_id=$1",
          [task.id],
        )
      ).count,
    ),
    1,
  );
  assert.equal(
    Number(
      (
        await one(
          db,
          "SELECT count(*) count FROM audit_events WHERE record_id=$1 AND kind='update_task'",
          [task.id],
        )
      ).count,
    ),
    2,
  );
});
async function setup() {
  const customer = await party(),
    supplier = await party('Supplier', 'supplier');
  const booking = await cmd('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    summary: 'Synthetic journey',
    product: 'Flight',
    channel: 'Direct',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 100000,
  });
  return { customer, supplier, booking };
}
test('third party must be authorized and credits settle responsible customer statement', async () => {
  const { booking, customer } = await setup(),
    payer = await party('Third party');
  const p = await cmd('payment', {
    party_id: payer.id,
    direction: 'customer',
    amount: 100000,
    date,
    method: 'ACH',
  });
  await assert.rejects(
    () => cmd('allocate', { payment_id: p.id, booking_id: booking.id, amount: 100000, date }),
    /Authorize/,
  );
  await cmd('authorize_payer', {
    booking_id: booking.id,
    party_id: payer.id,
    reason: 'Customer requested company payment',
  });
  await cmd('allocate', { payment_id: p.id, booking_id: booking.id, amount: 100000, date });
  const d = await detail(db, testOwner, 'person', customer.id);
  assert.equal(
    d.statement.reduce((a: number, r: any) => a + Number(r.debit) - Number(r.credit), 0),
    0,
  );
});
test('seller-funded external points charge actual use cost without Padova inventory basis', async () => {
  const { booking } = await setup(),
    seller = await party('Points seller', 'partner');
  const a = await cmd('acquire_asset', {
    name: 'External award account',
    kind: 'Points',
    issuer: 'AA',
    quantity: 100000,
    cost: 0,
    seller_id: seller.id,
    ownership: 'External',
    date,
  });
  await cmd('fund', {
    booking_id: booking.id,
    asset_id: a.id,
    kind: 'Seller funded points',
    face_amount: 30000,
    cost: 36000,
    date,
    settled: true,
  });
  const e = await economics(db, booking.id);
  assert.equal(Number(e.funding_cost), 36000);
  assert.equal(Number(e.supplier_balance), 0);
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 70000);
  assert.equal(Number(b.remaining_basis), 0);
});
test('100k to 120k point transfer preserves basis and fees', async () => {
  const from = await cmd('acquire_asset', {
      name: 'Amex',
      kind: 'Points',
      issuer: 'Amex',
      quantity: 100000,
      cost: 120000,
      date,
    }),
    to = await cmd('acquire_asset', {
      name: 'Airline',
      kind: 'Points',
      issuer: 'Airline',
      quantity: 1,
      cost: 0,
      date,
    });
  await cmd('transfer_asset', {
    sending_asset_id: from.id,
    receiving_asset_id: to.id,
    quantity_sent: 100000,
    quantity_received: 120000,
    fees: 1000,
    date,
  });
  const a = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [from.id]),
    b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [to.id]);
  assert.equal(Number(a.remaining_basis), 0);
  assert.equal(Number(b.remaining_basis), 121000);
  assert.equal(Number(b.balance), 120001);
});
test('asset expiration writes off remaining basis with immutable history', async () => {
  const a = await cmd('acquire_asset', {
    name: 'Expired',
    kind: 'Voucher',
    issuer: 'Test',
    quantity: 10000,
    cost: 8500,
    expires_on: '2026-09-30',
    date: '2026-09-01',
  });
  await cmd('expire_asset', {
    asset_id: a.id,
    quantity: 10000,
    date,
    reason: 'Expired per issuer',
  });
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 0);
  assert.equal(Number(b.remaining_basis), 0);
});
test('seller payment goes to exact funding counterparty, not airline', async () => {
  const { booking } = await setup(),
    seller = await party('Seller', 'partner');
  await cmd('fund', {
    booking_id: booking.id,
    kind: 'Purchased reservation',
    seller_id: seller.id,
    face_amount: 80000,
    cost: 70000,
    date,
  });
  await cmd('payment', {
    party_id: seller.id,
    direction: 'supplier',
    amount: 70000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: booking.id, amount: 70000 }],
  });
  assert.equal((await economics(db, booking.id)).supplier_balance, 0);
});
test('split cancellation cases preserve cash and points units', async () => {
  const { booking } = await setup();
  const a = await cmd('acquire_asset', {
    name: 'Points',
    kind: 'Points',
    issuer: 'AA',
    quantity: 30000,
    cost: 36000,
    date,
  });
  const fp = await cmd('fund', {
      booking_id: booking.id,
      kind: 'Points',
      asset_id: a.id,
      face_amount: 30000,
      date,
    }),
    fc = await cmd('fund', {
      booking_id: booking.id,
      kind: 'Card fees',
      face_amount: 4000,
      date,
      settled: true,
    });
  const rp = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: fp.id,
    supplier_expected: 30000,
    customer_due: 0,
    due_on: date,
    date,
    reason: 'Points return',
  });
  const rc = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: fc.id,
    supplier_expected: 4000,
    customer_due: 0,
    due_on: date,
    date,
    reason: 'Card return',
  });
  assert.equal(rp.unit, 'points');
  assert.equal(rc.unit, 'cents');
  await cmd('receive_refund', {
    refund_id: rp.id,
    amount: 30000,
    form: 'points',
    asset_id: a.id,
    original_movement_id: fp.asset_movement_id,
    date,
  });
  await cmd('receive_refund', { refund_id: rc.id, amount: 4000, form: 'cash', date });
  assert.equal((await economics(db, booking.id)).profit, 100000);
});
test('FIFO fractional uses consume original basis exactly', async () => {
  const { booking } = await setup(),
    a = await cmd('acquire_asset', {
      name: 'Rounding',
      kind: 'Voucher',
      issuer: 'Test',
      quantity: 3,
      cost: 2,
      date,
    });
  for (let i = 0; i < 3; i++)
    await cmd('fund', {
      booking_id: booking.id,
      asset_id: a.id,
      kind: 'Voucher',
      face_amount: 1,
      date,
    });
  const b = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(b.balance), 0);
  assert.equal(Number(b.remaining_basis), 0);
  assert.equal(Number((await economics(db, booking.id)).funding_cost), 2);
});
test('unpaid asset sale can receive partial settlements', async () => {
  const buyer = await party(),
    a = await cmd('acquire_asset', {
      name: 'Voucher',
      kind: 'Voucher',
      issuer: 'Test',
      quantity: 10000,
      cost: 8500,
      date,
    });
  const sale = await cmd('sell_asset', {
    asset_id: a.id,
    buyer_id: buyer.id,
    quantity: 10000,
    proceeds: 9500,
    date,
  });
  await cmd('receive_asset_sale', { sale_id: sale.id, amount: 4000, date, method: 'ACH' });
  await cmd('receive_asset_sale', { sale_id: sale.id, amount: 5500, date, method: 'ACH' });
  await assert.rejects(
    () => cmd('receive_asset_sale', { sale_id: sale.id, amount: 1, date, method: 'ACH' }),
    /exceeds/,
  );
});
test('asset acquisition payable settles against recorded seller', async () => {
  const seller = await party('Seller', 'partner'),
    a = await cmd('acquire_asset', {
      name: 'Credit',
      kind: 'Hotel credit',
      issuer: 'Hotel',
      quantity: 100000,
      cost: 80000,
      seller_id: seller.id,
      date,
    });
  await cmd('pay_asset_purchase', { asset_id: a.id, amount: 80000, date, method: 'ACH' });
  await assert.rejects(
    () => cmd('pay_asset_purchase', { asset_id: a.id, amount: 1, date, method: 'ACH' }),
    /exceeds/,
  );
});
test('one commission receipt covers several net receivables and referral waits for receipt', async () => {
  const { booking, supplier } = await setup(),
    r = await party('Referrer'),
    collector = await party('Agency', 'partner');
  await declareNoSupplierCost(db, booking.id, date);
  const c1 = await cmd('commission', {
      booking_id: booking.id,
      payer_id: supplier.id,
      collector_id: collector.id,
      gross: 10000,
      retained: 1000,
      due_on: date,
      date,
    }),
    c2 = await cmd('commission', {
      booking_id: booking.id,
      payer_id: supplier.id,
      collector_id: collector.id,
      gross: 20000,
      retained: 2000,
      due_on: date,
      date,
    });
  const ref = await cmd('referral', {
    booking_id: booking.id,
    referrer_id: r.id,
    basis: 'profit',
    rate_bps: 2000,
    due_on: date,
    date,
  });
  await assert.rejects(
    () => cmd('pay_referral', { referral_id: ref.id, amount: 1000, date, method: 'ACH' }),
    /Commission must arrive/,
  );
  const p = await cmd('payment', {
    party_id: collector.id,
    direction: 'commission',
    amount: 27000,
    date,
    method: 'ACH',
  });
  for (const [c, amount] of [
    [c1, 9000],
    [c2, 18000],
  ] as const)
    await cmd('commission_receipt', { commission_id: c.id, payment_id: p.id, amount, date });
  await cmd('pay_referral', { referral_id: ref.id, amount: 25400, date, method: 'ACH' });
  const b = await economics(db, booking.id);
  assert.equal(b.profit, 101600);
});
test('financial acknowledgment retains actor and debt remains visible until settled', async () => {
  const { booking } = await setup();
  let s = await snapshot(db, testOwner);
  const item = s.attention.find((a: any) => a.key === `balance:${booking.id}`)!;
  await cmd('resolve_attention', {
    key: item.key,
    fingerprint: item.fingerprint,
    note: 'Reviewed current balance',
  });
  s = await snapshot(db, testOwner);
  assert.ok(s.attention.some((a: any) => a.key === item.key && a.acknowledged));
  await cmd('charge', { booking_id: booking.id, amount: 1000, date, kind: 'Fee' });
  s = await snapshot(db, testOwner);
  assert.ok(s.attention.some((a: any) => a.key === item.key));
});
test('ledger invariants after mixed workflows', async () => {
  const balances = await db.query(
    'SELECT command_id,sum(debit-credit) balance FROM journal_lines GROUP BY command_id HAVING sum(debit-credit)<>0',
  );
  assert.equal(balances.rows.length, 0);
  const assets = await db.query(
    'SELECT * FROM asset_balances WHERE balance<0 OR remaining_basis<0',
  );
  assert.equal(assets.rows.length, 0);
  const payments = await db.query(
    'SELECT * FROM payment_balances WHERE allocated+commission_allocated>current_amount',
  );
  assert.equal(payments.rows.length, 0);
  const missing = await db.query(
    'SELECT c.id FROM commands c LEFT JOIN audit_events a ON a.command_id=c.id WHERE a.id IS NULL',
  );
  assert.equal(missing.rows.length, 0);
});
test('downward correction reverses allocation without destroying original receipt', async () => {
  const { customer, booking } = await setup();
  const p = await cmd('payment', {
    party_id: customer.id,
    direction: 'customer',
    amount: 90000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: booking.id, amount: 90000 }],
  });
  await cmd('correct_payment', {
    payment_id: p.id,
    amount: 85000,
    date,
    reason: 'Corrected overstated receipt',
  });
  const balance = await one(db, 'SELECT * FROM payment_balances WHERE id=$1', [p.id]);
  assert.equal(Number(balance.current_amount), 85000);
  assert.equal(Number(balance.allocated), 85000);
  assert.equal(Number(balance.amount), 90000);
  assert.equal((await economics(db, booking.id)).customer_balance, 15000);
});
test('new noncash refund creates asset without fictional acquisition payable', async () => {
  const card = await cmd('payment_account', {
    name: 'Synthetic refund original card',
    kind: 'Card',
    ownership: 'Padova',
  });
  const { booking } = await setup();
  const f = await cmd('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 80000,
    date,
    settled: true,
    account_id: card.id,
  });
  const r = await cmd('cancel', {
    booking_id: booking.id,
    funding_component_id: f.id,
    supplier_expected: 80000,
    customer_due: 0,
    due_on: date,
    date,
    reason: 'Returned as credit',
  });
  const m = await cmd('receive_refund', {
    refund_id: r.id,
    amount: 80000,
    form: 'Airline credit',
    basis: 80000,
    new_asset: { name: 'New returned credit', issuer: 'Airline' },
    date,
  });
  assert.ok(m.asset_id);
  const bad = await db.query(
    "SELECT * FROM journal_lines WHERE command_id=$1 AND account='asset_acquisition_payable'",
    [m.command_id],
  );
  assert.equal(bad.rows.length, 0);
});
test('inventory subledger reconciles to operational journal', async () => {
  const assets = await one(db, 'SELECT COALESCE(sum(remaining_basis),0) basis FROM asset_balances');
  const journal = await one(
    db,
    "SELECT COALESCE(sum(debit-credit),0) basis FROM journal_lines WHERE account='travel_inventory'",
  );
  assert.equal(Number(journal.basis), Number(assets.basis));
});
test('component refund restores multiple acquisition lots without manual movement IDs', async () => {
  const { booking } = await setup();
  const a = await cmd('acquire_asset', {
    name: 'AA account',
    kind: 'Points',
    issuer: 'AA',
    quantity: 10000,
    cost: 12000,
    date,
  });
  const b = await cmd('acquire_asset', {
    name: 'Amex account',
    kind: 'Points',
    issuer: 'Amex',
    quantity: 20000,
    cost: 24000,
    date,
  });
  await cmd('transfer_asset', {
    sending_asset_id: b.id,
    receiving_asset_id: a.id,
    quantity_sent: 20000,
    quantity_received: 20000,
    date,
  });
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
    date,
    due_on: date,
    reason: 'Cancelled award',
  });
  await cmd('receive_refund', { refund_id: r.id, amount: 30000, form: 'points', date });
  const balance = await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [a.id]);
  assert.equal(Number(balance.balance), 30000);
  assert.equal(Number(balance.remaining_basis), 36000);
  assert.equal((await economics(db, booking.id)).profit, 100000);
});
