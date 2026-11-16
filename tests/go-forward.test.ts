import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner, declareNoSupplierCost } from './helpers';
import type { Database, Row } from '../src/lib/db';
import { execute, economics, type CommandKind } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';
let db: Database;
const date = '2026-10-15';
const run = (kind: CommandKind, data: unknown, key = randomUUID()) =>
  execute(db, testOwner, { id: key, kind, data });
before(async () => {
  db = await financialDatabase();
});
after(async () => {
  await db.close();
});
async function setup(cost: number | null = 60000) {
  const customer = await run('party', {
      name: 'Forward customer ' + randomUUID(),
      kind: 'person',
      roles: ['customer', 'traveler'],
    }),
    seller = await run('party', {
      name: 'Forward seller ' + randomUUID(),
      kind: 'company',
      roles: ['seller', 'commission_payer'],
    }),
    payee = await run('party', {
      name: 'Forward agent ' + randomUUID(),
      kind: 'person',
      roles: ['customer'],
    });
  const booking = await run('booking', {
    customer_id: customer.id,
    supplier_id: seller.id,
    product: 'Other',
    channel: 'Direct',
    summary: 'Forward acceptance',
    booked_on: date,
    travel_start: '2026-12-05',
    travel_end: '2026-12-06',
    sale: 100000,
  });
  if (cost === 0) await declareNoSupplierCost(db, booking.id, date);
  else if (cost != null)
    await run('fund', {
      booking_id: booking.id,
      seller_id: seller.id,
      kind: 'Cash',
      face_amount: cost,
      cost,
      settled: false,
      date,
    });
  return { customer, seller, payee, booking };
}
async function payable(x: Awaited<ReturnType<typeof setup>>, extra: Row = {}) {
  return run('referral', {
    booking_id: x.booking.id,
    referrer_id: x.payee.id,
    basis: 'fixed',
    fixed_amount: 5000,
    reason: 'Agreed agent share for new booking',
    earned: true,
    payable_when: 'When earned',
    due_on: date,
    date,
    ...extra,
  });
}
async function state(id: string) {
  return (await snapshot(db, testOwner)).referrals.find((r: Row) => r.id === id)!;
}
async function revise(id: string, extra: Row = {}) {
  const r = await state(id);
  return run('revise_referral', {
    referral_id: id,
    revision: r.revision,
    basis: r.calculation === 'fixed' ? 'fixed' : 'percentage',
    percentage_basis: r.percentage_basis,
    rate_bps: r.rate_bps,
    fixed_amount: r.fixed_amount,
    agreed_basis: r.agreed_basis,
    earned: r.earned,
    payable_when: r.payable_when,
    due_on: r.due_on,
    cancellation_rule: 'Realized economics',
    reason: 'Corrected agreement documented by agent',
    date,
    ...extra,
  });
}

test('go-forward payable supports partial payments, exact replay and concurrent overpayment protection', async () => {
  const x = await setup(),
    r = await payable(x);
  assert.equal((await state(r.id)).payable_now, 5000);
  const key = randomUUID(),
    data = {
      referral_id: r.id,
      amount: 2000,
      date,
      method: 'ACH',
      reference: 'Actual first payout',
    };
  const first = await run('pay_referral', data, key);
  await run('pay_referral', data, key);
  assert.equal((await state(r.id)).paid, 2000);
  assert.equal((await state(r.id)).outstanding, 3000);
  await assert.rejects(
    run('pay_referral', { ...data, amount: 2001 }, key),
    /reused|different|payload|conflict/i,
  );
  const raced = await Promise.allSettled([
    run('pay_referral', { ...data, amount: 3000 }),
    run('pay_referral', { ...data, amount: 3000 }),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await state(r.id)).paid, 5000);
  assert.equal((await state(r.id)).status, 'Paid');
  assert.ok(first.payment_id);
  assert.equal(
    Number((await db.query('SELECT sum(debit-credit) n FROM journal_lines')).rows[0].n),
    0,
  );
});

test('go-forward multiple payees and explicit percentage bases do not charge commission on commission', async () => {
  const x = await setup();
  await run('commission', {
    booking_id: x.booking.id,
    payer_id: x.seller.id,
    gross: 10000,
    retained: 2000,
    due_on: date,
    date,
  });
  const r = await payable(x, { basis: 'percentage', percentage_basis: 'profit', rate_bps: 2000 });
  const another = await run('party', {
    name: 'Second agent ' + randomUUID(),
    kind: 'company',
    roles: ['seller'],
  });
  const f = await payable(x, { referrer_id: another.id, fixed_amount: 3000 });
  assert.equal((await state(r.id)).expected_due, 9600);
  assert.equal((await state(f.id)).expected_due, 3000);
  assert.equal((await economics(db, x.booking.id)).profit, 35400);
  await revise(r.id, { percentage_basis: 'sale', rate_bps: 1000 });
  assert.equal((await state(r.id)).expected_due, 10000);
  await revise(r.id, { percentage_basis: 'commission', rate_bps: 2500 });
  assert.equal((await state(r.id)).expected_due, 2000);
  await revise(r.id, { percentage_basis: 'agreed_amount', agreed_basis: 12345, rate_bps: 1234 });
  assert.equal((await state(r.id)).expected_due, 1523);
  const versions = (
    await db.query(
      'SELECT * FROM commission_payable_revisions WHERE referral_id=$1 ORDER BY revision',
      [r.id],
    )
  ).rows;
  assert.equal(versions.length, 4);
  assert.equal(Number(versions[0].rate_bps), 2000);
  await revise(r.id, { percentage_basis: 'commission_received', rate_bps: 2500 });
  assert.equal((await state(r.id)).expected_due, 0);
  const commission = (
    await db.query('SELECT id FROM commissions WHERE booking_id=$1', [x.booking.id])
  ).rows[0];
  await run('payment', {
    direction: 'commission',
    party_id: x.seller.id,
    amount: 8000,
    date,
    method: 'ACH',
    commission_allocations: [{ commission_id: commission.id, amount: 8000 }],
  });
  assert.equal((await state(r.id)).expected_due, 2000);
  await assert.rejects(
    db.query('UPDATE commission_payable_revisions SET reason=$1 WHERE referral_id=$2', [
      'Overwrite history',
      r.id,
    ]),
  );
});

test('go-forward unknown profit basis stays Unknown, while explicit zero and sales basis remain usable', async () => {
  const x = await setup(null),
    r = await payable(x, { basis: 'percentage', percentage_basis: 'profit', rate_bps: 2000 });
  let s = await state(r.id);
  assert.equal(s.expected_due, null);
  assert.equal(s.accrued, null);
  assert.equal(s.payable_now, 0);
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /unknown/i,
  );
  const snapshotBefore = await snapshot(db, testOwner);
  assert.ok(
    snapshotBefore.operationalViews['Missing Cost'].some((b: Row) => b.booking_id === x.booking.id),
  );
  assert.ok(
    snapshotBefore.operationalViews['Commission Payable'].some(
      (b: Row) => b.id === r.id && b.amount === null,
    ),
  );
  await revise(r.id, { percentage_basis: 'sale', rate_bps: 1000 });
  assert.equal((await state(r.id)).expected_due, 10000);
  assert.equal((await economics(db, x.booking.id)).profit, null);
  await revise(r.id, { basis: 'fixed', fixed_amount: 0 });
  assert.equal((await state(r.id)).expected_due, 0);
  await assert.rejects(
    revise(r.id, {
      basis: 'percentage',
      percentage_basis: 'agreed_amount',
      agreed_basis: undefined,
    }),
    /basis amount|Unknown/i,
  );
});

test('go-forward corrections and payout reversals preserve original payments and recovery balances', async () => {
  const x = await setup(),
    r = await payable(x, { fixed_amount: 10000 });
  const payment = await run('pay_referral', {
    referral_id: r.id,
    amount: 8000,
    date,
    method: 'ACH',
  });
  await revise(r.id, { fixed_amount: 5000 });
  let s = await state(r.id);
  assert.equal(s.paid, 8000);
  assert.equal(s.recovery_due, 3000);
  assert.equal(
    (await snapshot(db, testOwner)).operationalViews['Commission Payable'].find(
      (x: Row) => x.id === r.id,
    )?.amount,
    3000,
  );
  assert.equal(s.outstanding, 0);
  const revKey = randomUUID();
  await run(
    'reverse_referral_payment',
    {
      payment_id: payment.payment_id,
      amount: 3000,
      date,
      reason: 'Actual partial payout returned',
    },
    revKey,
  );
  await run(
    'reverse_referral_payment',
    {
      payment_id: payment.payment_id,
      amount: 3000,
      date,
      reason: 'Actual partial payout returned',
    },
    revKey,
  );
  assert.equal((await state(r.id)).paid, 5000);
  assert.equal((await state(r.id)).recovery_due, 0);
  s = await state(r.id);
  await run('reverse_referral', {
    referral_id: r.id,
    revision: s.revision,
    date,
    reason: 'Agreement rescinded; reclaim outstanding paid amount',
  });
  assert.equal((await state(r.id)).recovery_due, 5000);
  await run('reverse_referral_payment', {
    payment_id: payment.payment_id,
    amount: 5000,
    date,
    reason: 'Remaining payout returned',
  });
  assert.equal((await state(r.id)).paid, 0);
  assert.equal(
    Number(
      (await db.query('SELECT amount FROM payments WHERE id=$1', [payment.payment_id])).rows[0]
        .amount,
    ),
    8000,
  );
  await assert.rejects(
    run('reverse_referral_payment', {
      payment_id: payment.payment_id,
      amount: 1,
      date,
      reason: 'Cannot return twice',
    }),
    /exceeds/,
  );
  await assert.rejects(revise(r.id), /Reversed agreement/);
  assert.equal(
    Number(
      (
        await db.query('SELECT sum(debit-credit) n FROM journal_lines WHERE booking_id=$1', [
          x.booking.id,
        ])
      ).rows[0].n,
    ),
    0,
  );
});

test('go-forward payable dates, manual earning, customer collection and commission collection gates are independent', async () => {
  const x = await setup(),
    r = await payable(x, { earned: false });
  assert.equal((await state(r.id)).accrued, 0);
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /Not yet earned/,
  );
  await revise(r.id, { earned: true, payable_when: 'After travel' });
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /Travel/,
  );
  await revise(r.id, { payable_when: 'On date', due_on: '2027-01-01' });
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /date/,
  );
  await revise(r.id, { payable_when: 'After customer paid', due_on: date });
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /Customer payment/,
  );
  await run('payment', {
    direction: 'customer',
    party_id: x.customer.id,
    amount: 100000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: x.booking.id, amount: 100000 }],
  });
  assert.equal((await state(r.id)).payable_now, 5000);
  const c = await run('commission', {
    booking_id: x.booking.id,
    payer_id: x.seller.id,
    gross: 10000,
    due_on: date,
    date,
  });
  await revise(r.id, { payable_when: 'After commission received' });
  await assert.rejects(
    run('pay_referral', { referral_id: r.id, amount: 1, date, method: 'ACH' }),
    /Commission must arrive/,
  );
  const receipt = await run('payment', {
    direction: 'commission',
    party_id: x.seller.id,
    amount: 10000,
    date,
    method: 'ACH',
  });
  await run('commission_receipt', {
    payment_id: receipt.id,
    commission_id: c.id,
    amount: 10000,
    date,
  });
  assert.equal((await state(r.id)).payable_now, 5000);
  await run('pay_referral', { referral_id: r.id, amount: 1000, date, method: 'ACH' });
});

test('go-forward payable permission, stale revisions and Notes/Activity attribution are enforced', async () => {
  const x = await setup(),
    r = await payable(x),
    worker = await financialEmployee(db);
  await assert.rejects(
    execute(db, worker, {
      id: randomUUID(),
      kind: 'pay_referral',
      data: { referral_id: r.id, amount: 1, date, method: 'ACH' },
    }),
    /Permission/,
  );
  const before = await state(r.id);
  await revise(r.id, { fixed_amount: 4000 });
  await assert.rejects(
    run('reverse_referral', {
      referral_id: r.id,
      revision: before.revision,
      date,
      reason: 'Stale tab',
    }),
    /changed/,
  );
  await run('note', {
    record_type: 'booking',
    record_id: x.booking.id,
    body: 'Agent agreement confirmed; synthetic evidence reference',
  });
  const d = await detail(db, testOwner, 'booking', x.booking.id);
  assert.ok(d.notes.some((n: Row) => n.body.includes('Agent agreement')));
  const audits = (
    await db.query(
      "SELECT * FROM audit_events WHERE record_id=$1 AND kind IN ('referral','revise_referral')",
      [x.booking.id],
    )
  ).rows;
  assert.ok(audits.length >= 2);
  assert.ok(audits.every((a) => a.actor === testOwner.id));
  const limited = await snapshot(db, worker);
  assert.deepEqual(limited.referrals, []);
  assert.deepEqual(limited.referralTerms, []);
  assert.deepEqual(limited.referralPayments, []);
  assert.deepEqual(limited.operationalViews['Commission Payable'], []);
  assert.equal(
    limited.bookings.find((b: Row) => b.id === x.booking.id)?.commission_payables,
    undefined,
  );
});

test('go-forward all eight queues reflect new transactions, credits, changes, points and retry-safe refunds', async () => {
  const x = await setup(),
    r = await payable(x);
  await run('pay_referral', { referral_id: r.id, amount: 1000, date, method: 'ACH' });
  await run('payment', {
    direction: 'customer',
    party_id: x.customer.id,
    amount: 30000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: x.booking.id, amount: 30000 }],
  });
  await run('payment', {
    direction: 'supplier',
    party_id: x.seller.id,
    amount: 20000,
    date,
    method: 'ACH',
    allocations: [{ booking_id: x.booking.id, amount: 20000 }],
  });
  await run('commission', {
    booking_id: x.booking.id,
    payer_id: x.seller.id,
    gross: 10000,
    due_on: date,
    date,
  });
  const missing = await setup(null),
    cancelled = await setup();
  const f = (
    await db.query('SELECT * FROM funding_components WHERE booking_id=$1', [cancelled.booking.id])
  ).rows[0];
  const refund = await run('cancel', {
    booking_id: cancelled.booking.id,
    funding_component_id: f.id,
    supplier_expected: 20000,
    customer_due: 0,
    charge_reduction: 20000,
    due_on: date,
    date,
    reason: 'Synthetic supplier return pending',
  });
  const credit = await run('price_match_event', {
    booking_id: x.booking.id,
    status: 'Pending',
    requested_amount: 1000,
    date,
    reason: 'Expected only, not received',
  });
  let s = await snapshot(db, testOwner);
  const queues = s.operationalViews;
  assert.deepEqual(Object.keys(queues), [
    'Customer Owes',
    'Padova Owes Sellers',
    'Commission Receivable',
    'Commission Payable',
    'Pending Refunds',
    'Pending Credits',
    'Missing Cost',
    'Needs Attention',
  ]);
  assert.ok(
    queues['Customer Owes'].some((b: Row) => b.booking_id === x.booking.id && b.amount === 70000),
  );
  assert.ok(
    queues['Padova Owes Sellers'].some(
      (b: Row) => b.booking_id === x.booking.id && b.amount === 40000,
    ),
  );
  assert.ok(
    queues['Commission Receivable'].some(
      (b: Row) => b.booking_id === x.booking.id && b.amount === 10000,
    ),
  );
  assert.ok(queues['Commission Payable'].some((b: Row) => b.id === r.id && b.amount === 4000));
  assert.ok(queues['Pending Refunds'].some((b: Row) => b.booking_id === cancelled.booking.id));
  assert.ok(queues['Pending Credits'].some((b: Row) => b.booking_id === x.booking.id));
  assert.ok(queues['Missing Cost'].some((b: Row) => b.booking_id === missing.booking.id));
  assert.ok(queues['Needs Attention'].length > 0);
  const key = randomUUID();
  await run('receive_refund', { refund_id: refund.id, amount: 20000, form: 'cash', date }, key);
  await run('receive_refund', { refund_id: refund.id, amount: 20000, form: 'cash', date }, key);
  s = await snapshot(db, testOwner);
  assert.ok(
    !s.operationalViews['Pending Refunds'].some((b: Row) => b.booking_id === cancelled.booking.id),
  );
  await run('price_match_event', {
    booking_id: x.booking.id,
    request_id: credit.request_id ?? credit.id,
    status: 'Denied',
    date,
    reason: 'No award; retain history',
  });
  const before = await economics(db, x.booking.id);
  await run('revise', {
    booking_id: x.booking.id,
    summary: 'Changed synthetic trip',
    travel_start: '2026-12-07',
    travel_end: '2026-12-08',
    additional_customer_charge: 5000,
    padova_change_fee: 5000,
    date,
    reason: 'Customer requested new dates',
  });
  assert.equal(
    (await economics(db, x.booking.id)).customer_balance,
    before.customer_balance + 5000,
  );
  const asset = await run('acquire_asset', {
    name: 'Synthetic owned points',
    kind: 'Points',
    issuer: 'Synthetic program',
    unit: 'points',
    quantity: 10000,
    cost: 5000,
    date,
  });
  const reward = await setup(null);
  await run('fund', {
    booking_id: reward.booking.id,
    asset_id: asset.id,
    kind: 'Points',
    face_amount: 2000,
    quantity: 2000,
    unit: 'points',
    date,
  });
  assert.equal((await economics(db, reward.booking.id)).funding_cost, 1000);
  const voucher = await run('voucherize', {
    booking_id: reward.booking.id,
    name: 'Synthetic returned value',
    quantity: 2000,
    basis: 1000,
    ownership: 'Padova',
    date,
  });
  assert.ok(voucher.id);
  assert.equal(
    Number((await db.query('SELECT sum(debit-credit) n FROM journal_lines')).rows[0].n),
    0,
  );
});
