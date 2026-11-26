import assert from 'node:assert/strict';
import test from 'node:test';
import { after, before } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  buildMoneyBackLines,
  moneyBackAmountBasisFromRate,
  moneyBackAmountBasisLabel,
  moneyBackCreditDetails,
  moneyBackFormForKind,
  moneyBackFormLabel,
  moneyBackHowReceived,
  moneyBackIsAdmCorrection,
  moneyBackIsoDate,
  moneyBackNote,
  moneyBackStatusLabel,
  priceMatchAmountCents,
  priceMatchMoneyBackEvents,
} from '../src/lib/money-back';
import {
  buildConfirmCommissionDefaults,
  grossRetainedFromNet9010,
  notesIndicateSruly9010,
} from '../src/lib/confirm-commission';
import { moneyBackDeductedCents } from '../src/lib/money-back-deduct';
import { appendMoneyBackVoid, isMoneyBackVoided } from '../src/lib/money-back-void';
import { appendMoneyBackDenial, isMoneyBackDenied } from '../src/lib/money-back-deny';
import {
  commissionOutstandingCents,
  expectedCommissionFollowUps,
} from '../src/lib/expected-commissions';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';

test('ADM / debit memo notes flag Money Back correction badge', () => {
  assert.equal(moneyBackIsAdmCorrection('ADM: earlier remittance too high'), true);
  assert.equal(moneyBackIsAdmCorrection('Airline debit memo — airline amount lower'), true);
  assert.equal(moneyBackIsAdmCorrection('Sruly remittance short'), false);
  assert.equal(moneyBackIsAdmCorrection(null), false);

  const lines = buildMoneyBackLines({
    bookingId: 'b-adm',
    commissions: [
      {
        id: 'c-adm',
        booking_id: 'b-adm',
        gross: 10000,
        retained: 0,
        received: 8000,
        payer: 'Sruly',
        notes: 'ADM correction — prior payment too high',
      },
    ],
  });
  assert.equal(moneyBackIsAdmCorrection(lines[0]?.note ?? null), true);
});

test('Money Back note surfaces when present — blank stays blank', () => {
  assert.equal(moneyBackNote('  Sruly remittance short  '), 'Sruly remittance short');
  assert.equal(moneyBackNote(''), null);
  assert.equal(moneyBackNote(null), null);

  const lines = buildMoneyBackLines({
    bookingId: 'b-note',
    operational: {
      commission: {
        expected: 'Yes',
        amount: 9000,
        payer_id: 'p1',
        notes: 'Default Sruly path ~90% Padova / 10% retained',
      },
      standing_deals: [
        {
          deal_id: 'd1',
          label: 'Marriott 10%',
          rate_bps: 1000,
          basis: 'sale_ex_tax',
          notes: '10% of stay price excluding taxes',
          amount_cents: null,
        },
      ],
    },
    priceMatchHistory: [
      {
        request_id: 'pm-n',
        status: 'Pending',
        expected_credit: 1000,
        profile: 'Cap1',
        notes: 'Awaiting Cap1 post',
      },
    ],
    partyName: () => 'Sruly',
  });
  assert.equal(
    lines.find((l) => l.kind === 'commission_expected')?.note,
    'Default Sruly path ~90% Padova / 10% retained',
  );
  assert.equal(
    lines.find((l) => l.kind === 'standing_deal')?.note,
    '10% of stay price excluding taxes',
  );
  assert.equal(lines.find((l) => l.kind === 'price_match')?.note, 'Awaiting Cap1 post');
});

test('Money Back amount basis is percent of base or fixed', () => {
  assert.equal(moneyBackAmountBasisLabel({ kind: 'fixed' }), 'Fixed amount');
  assert.equal(
    moneyBackAmountBasisLabel({ kind: 'percent', rateBps: 1500, baseLabel: 'profit' }),
    '15% of profit',
  );
  assert.deepEqual(
    moneyBackAmountBasisFromRate({ rate_bps: 1000, basis: 'sale_ex_tax' }),
    { kind: 'percent', rateBps: 1000, baseLabel: 'sale excluding taxes' },
  );
  assert.equal(moneyBackAmountBasisFromRate({ basis: 'fixed' }).kind, 'fixed');

  const lines = buildMoneyBackLines({
    bookingId: 'b-basis',
    operational: {
      standing_deals: [
        {
          deal_id: 'd1',
          label: 'Marriott 10%',
          rate_bps: 1000,
          basis: 'sale_ex_tax',
          amount_cents: null,
        },
      ],
    },
    referrals: [
      {
        id: 'r1',
        booking_id: 'b-basis',
        referrer: 'Chabad',
        rate_bps: 2000,
        percentage_basis: 'profit',
        expected_due: 5000,
        paid: 0,
        outstanding: 5000,
      },
    ],
    commissions: [
      {
        id: 'c1',
        booking_id: 'b-basis',
        gross: 10000,
        retained: 1000,
        received: 0,
        payer: 'Sruly',
      },
    ],
  });
  const referral = lines.find((l) => l.kind === 'referral_payable')!;
  const standing = lines.find((l) => l.kind === 'standing_deal')!;
  const commission = lines.find((l) => l.kind === 'commission_receivable')!;
  assert.equal(moneyBackAmountBasisLabel(referral.amountBasis), '20% of profit');
  assert.equal(moneyBackAmountBasisLabel(standing.amountBasis), '10% of sale excluding taxes');
  assert.equal(moneyBackAmountBasisLabel(commission.amountBasis), 'Fixed amount');
});

test('Money Back credit details carry profile + expiry when known', () => {
  assert.deepEqual(
    moneyBackCreditDetails({
      profile: 'Venture X 6039',
      expires_on: '2027-06-01T12:00:00Z',
    }),
    { profile: 'Venture X 6039', expiresOn: '2027-06-01' },
  );
  assert.deepEqual(moneyBackCreditDetails({}), { profile: null, expiresOn: null });

  const lines = buildMoneyBackLines({
    bookingId: 'b-credit',
    priceMatchHistory: [
      {
        request_id: 'pm-c',
        status: 'Accepted',
        expected_credit: 19792,
        profile: 'Cap1 Personal',
        expires_on: '2027-01-15',
      },
    ],
  });
  assert.equal(lines[0].form, 'credit');
  assert.equal(lines[0].creditProfile, 'Cap1 Personal');
  assert.equal(lines[0].creditExpiresOn, '2027-01-15');
});

test('Money Back form is cash or credit by kind', () => {
  assert.equal(moneyBackFormForKind('price_match'), 'credit');
  assert.equal(moneyBackFormForKind('commission_expected'), 'cash');
  assert.equal(moneyBackFormForKind('commission_receivable'), 'cash');
  assert.equal(moneyBackFormForKind('referral_payable'), 'cash');
  assert.equal(moneyBackFormForKind('standing_deal'), 'cash');
  assert.equal(moneyBackFormForKind('commission_receivable', 'credit issued'), 'credit');
  assert.equal(moneyBackFormLabel('cash'), 'Cash');
  assert.equal(moneyBackFormLabel('credit'), 'Credit');

  const lines = buildMoneyBackLines({
    bookingId: 'b-form',
    operational: {
      commission: { expected: 'Yes', amount: 1000, payer_id: 'p1' },
      standing_deals: [{ deal_id: 'd1', label: 'Marriott 10%', amount_cents: 500 }],
    },
    commissions: [],
    referrals: [],
    priceMatchHistory: [
      { request_id: 'pm1', status: 'Pending', expected_credit: 19792, profile: 'Cap1' },
    ],
    partyName: () => 'Sruly',
  });
  const byKind = Object.fromEntries(lines.map((l) => [l.kind, l.form]));
  assert.equal(byKind.commission_expected, 'cash');
  assert.equal(byKind.standing_deal, 'cash');
  assert.equal(byKind.price_match, 'credit');
});

test('confirm expected Money Back seeds commission defaults (90/10 net → gross)', () => {
  assert.equal(
    notesIndicateSruly9010('Default Sruly path ~90% Padova / 10% retained'),
    true,
  );
  assert.deepEqual(grossRetainedFromNet9010(9000), { gross: 10000, retained: 1000 });
  assert.equal(grossRetainedFromNet9010(9001), null);

  const seeded = buildConfirmCommissionDefaults({
    bookingId: 'b1',
    which: 'primary',
    commission: {
      expected: 'Yes',
      amount: 9000,
      payer_id: 'sruly',
      due_on: '2026-12-15',
      notes: 'Default Sruly path ~90% Padova / 10% retained',
    },
  });
  assert.deepEqual(seeded, {
    booking_id: 'b1',
    payer_id: 'sruly',
    due_on: '2026-12-15',
    gross: 10000,
    retained: 1000,
    is_iata_partner: true,
    confirm_from: 'expected_primary',
  });

  const blank = buildConfirmCommissionDefaults({
    bookingId: 'b2',
    which: 'secondary',
    secondary_commission: { expected: 'Yes', amount: null, payer_id: 'marty' },
  });
  assert.equal(blank.is_iata_partner, false);
  assert.equal(blank.payer_id, 'marty');
  assert.equal(blank.gross, undefined);
  assert.equal(blank.confirm_from, 'expected_secondary');
});

test('expected commissions become Money Back in-lines when no receivable posted', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational: {
      commission: { expected: 'Yes', amount: 9000, payer_id: 'p1' },
      secondary_commission: { expected: 'Unknown', amount: null, payer_id: 'p2' },
    },
    commissions: [],
    referrals: [],
    partyName: (id) => (id === 'p1' ? 'Sruly' : id === 'p2' ? 'Marty' : 'Unknown'),
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].direction, 'in');
  assert.equal(lines[0].expectedCents, 9000);
  assert.equal(lines[0].party, 'Sruly');
  assert.equal(lines[1].party, 'Marty');
  assert.equal(lines[1].expectedCents, null);
});

test('recorded receivable maps expected vs received status', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    commissions: [
      {
        id: 'c1',
        booking_id: 'b1',
        gross: 10000,
        retained: 1000,
        received: 9000,
        payer: 'Sruly',
        is_iata_partner: true,
      },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'commission_receivable');
  assert.equal(lines[0].expectedCents, 9000);
  assert.equal(lines[0].receivedCents, 9000);
  assert.equal(lines[0].status, 'received');
  assert.equal(lines[0].grossCents, 10000);
  assert.equal(lines[0].retainedCents, 1000);
  assert.equal(moneyBackStatusLabel('received'), 'Received');
});

test('moneyBackIsoDate / howReceived never invent', () => {
  assert.equal(moneyBackIsoDate(null), null);
  assert.equal(moneyBackIsoDate(''), null);
  assert.equal(moneyBackIsoDate('2026-12-01T15:00:00.000Z'), '2026-12-01');
  assert.equal(moneyBackHowReceived(null, false), null);
  assert.equal(moneyBackHowReceived('Zelle', false), 'Zelle');
  assert.equal(moneyBackHowReceived('Check', false), 'check');
  assert.equal(moneyBackHowReceived(null, true), 'deducted');
  assert.equal(moneyBackHowReceived('Zelle', true), 'Zelle; deducted');
  assert.equal(moneyBackHowReceived('credit issued', false), 'credit issued');
});

test('receivable dates + howReceived from posted/payment/deduct facts', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    commissions: [
      {
        id: 'c1',
        booking_id: 'b1',
        gross: 10000,
        retained: 1000,
        received: 7000,
        due_on: '2026-12-15',
        posted_at: '2026-11-20T10:00:00.000Z',
        received_on: '2026-11-25',
        received_method: 'Zelle',
        payer: 'Sruly',
      },
    ],
    operational: {
      money_back_deductions: [
        {
          target_kind: 'commission',
          target_id: 'c1',
          amount_cents: 2000,
          how_received: 'deducted',
          reason: 'short',
          deducted_at: '2026-11-26T00:00:00.000Z',
        },
      ],
    } as any,
  });
  assert.equal(lines[0].expectedOn, '2026-12-15');
  assert.equal(lines[0].confirmedOn, '2026-11-20');
  assert.equal(lines[0].receivedOn, '2026-11-25');
  assert.equal(lines[0].howReceived, 'Zelle; deducted');
});

test('expected-only line keeps blank dates when due_on missing', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational: { commission: { expected: 'Yes', amount: 9000, payer_id: 'p1' } } as any,
    commissions: [],
  });
  assert.equal(lines[0].kind, 'commission_expected');
  assert.equal(lines[0].expectedOn, null);
  assert.equal(lines[0].confirmedOn, undefined);
  assert.equal(lines[0].receivedOn, undefined);
  assert.equal(lines[0].howReceived, undefined);
});

test('price match Received shows receivedOn + credit issued', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    priceMatchHistory: [
      {
        id: 'e1',
        request_id: 'req-1',
        status: 'Received',
        received_amount: 19792,
        received_on: '2026-11-22',
        date: '2026-11-18',
      },
    ],
  });
  assert.equal(lines[0].receivedOn, '2026-11-22');
  assert.equal(lines[0].howReceived, 'credit issued');
  assert.equal(lines[0].expectedOn, '2026-11-18');
});

test('gross/retained omitted when collector keeps nothing', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    commissions: [
      {
        id: 'c2',
        booking_id: 'b1',
        gross: 5000,
        retained: 0,
        received: 0,
        payer: 'Direct hotel',
      },
    ],
  });
  assert.equal(lines[0].expectedCents, 5000);
  assert.equal(lines[0].grossCents, undefined);
  assert.equal(lines[0].retainedCents, undefined);
});

test('gross/retained survive deduction — Expected is post-deduction net', () => {
  const operational = {
    money_back_deductions: [
      {
        target_kind: 'commission',
        target_id: 'c1',
        amount_cents: 2000,
        how_received: 'deducted',
        reason: 'Sruly remittance short',
        deducted_at: '2026-11-25T00:00:00.000Z',
      },
    ],
  };
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational: operational as any,
    commissions: [
      {
        id: 'c1',
        booking_id: 'b1',
        gross: 10000,
        retained: 1000,
        received: 7000,
        payer: 'Sruly',
      },
    ],
  });
  assert.equal(lines[0].grossCents, 10000);
  assert.equal(lines[0].retainedCents, 1000);
  assert.equal(lines[0].expectedCents, 7000);
  assert.equal(lines[0].deductedCents, 2000);
});

test('deduction reduces expected and settles when paid less', () => {
  const operational = {
    money_back_deductions: [
      {
        target_kind: 'commission',
        target_id: 'c1',
        amount_cents: 2000,
        how_received: 'deducted',
        reason: 'Sruly remittance short',
        deducted_at: '2026-11-25T00:00:00.000Z',
      },
    ],
  };
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational,
    commissions: [
      {
        id: 'c1',
        booking_id: 'b1',
        gross: 10000,
        retained: 1000,
        received: 7000,
        payer: 'Sruly',
      },
    ],
  });
  assert.equal(lines[0].expectedCents, 7000);
  assert.equal(lines[0].receivedCents, 7000);
  assert.equal(lines[0].deductedCents, 2000);
  assert.equal(lines[0].status, 'received');
  assert.equal(
    commissionOutstandingCents({ gross: 10000, retained: 1000, received: 7000, deducted: 2000 }),
    0,
  );
  assert.equal(moneyBackDeductedCents(operational, 'commission', 'c1'), 2000);
});

test('referral is Money Back out (payable)', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    referrals: [
      {
        id: 'r1',
        booking_id: 'b1',
        referrer: 'Chabad',
        expected_due: 2000,
        paid: 0,
        outstanding: 2000,
        accrued: 0,
        status: 'Open',
      },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].direction, 'out');
  assert.equal(lines[0].kind, 'referral_payable');
  assert.equal(lines[0].status, 'expected');
});

test('price match events appear as in-lines', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    priceMatchHistory: [{ id: 'pm1', status: 'Accepted', credit_amount: 49.5, profile: 'Cap1 A' }],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'price_match');
  assert.equal(lines[0].direction, 'in');
  assert.equal(lines[0].status, 'confirmed');
  assert.equal(lines[0].expectedCents, 4950);
});

test('price match dedupes status history; uses integer cent fields', () => {
  assert.equal(priceMatchAmountCents({ expected_credit: 19792 }), 19792);
  assert.equal(priceMatchAmountCents({}), null);
  const history = [
    {
      id: 'e1',
      request_id: 'req-a',
      status: 'Pending',
      requested_amount: 20000,
      profile_id: 'prof1',
    },
    {
      id: 'e2',
      request_id: 'req-a',
      status: 'Approved',
      expected_credit: 19792,
      approved_amount: 19792,
      profile_id: 'prof1',
    },
    {
      id: 'e3',
      request_id: 'req-a',
      status: 'Received',
      expected_credit: 19792,
      approved_amount: 19792,
      received_amount: 19792,
      profile_id: 'prof1',
    },
    {
      id: 'e4',
      request_id: 'req-b',
      status: 'Pending',
      expected_credit: 5000,
      profile_id: 'prof1',
    },
  ];
  assert.equal(priceMatchMoneyBackEvents(history).length, 2);
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    priceMatchHistory: history,
    profileName: (id) => (id === 'prof1' ? 'Cap1 Shmuel' : ''),
  });
  assert.equal(lines.length, 2);
  const received = lines.find((l) => l.id === 'req-a')!;
  const pending = lines.find((l) => l.id === 'req-b')!;
  assert.equal(received.status, 'received');
  assert.equal(received.expectedCents, 19792);
  assert.equal(received.receivedCents, 19792);
  assert.equal(received.party, 'Cap1 Shmuel');
  assert.equal(pending.status, 'expected');
  assert.equal(pending.expectedCents, 5000);
  assert.equal(pending.receivedCents, 0);
});

test('Money Back void marker flips expected line to voided', () => {
  const operational = appendMoneyBackVoid(
    { version: 1, sale_known: true, commission: { expected: 'Yes', amount: 9000, payer_id: 'p1' } },
    {
      target_kind: 'expected_primary',
      target_id: 'primary',
      reason: 'Hotel cancelled — no commission',
      voided_at: '2026-11-25T00:00:00.000Z',
    },
  );
  assert.equal(isMoneyBackVoided(operational, 'expected_primary', 'primary'), true);
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational: operational as any,
    commissions: [],
  });
  assert.equal(lines[0].status, 'voided');
  assert.equal(moneyBackStatusLabel('voided'), 'Voided');
});

test('price match Denied maps to Money Back denied', () => {
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    priceMatchHistory: [{ id: 'pm1', status: 'Denied', credit_amount: 49.5, profile: 'Cap1 A' }],
  });
  assert.equal(lines[0].status, 'denied');
  assert.equal(moneyBackStatusLabel('denied'), 'Denied');
});

test('deny marker flips expected line; excluded from follow-ups', () => {
  const operational = appendMoneyBackDenial(
    { version: 1, sale_known: true, commission: { expected: 'Yes', amount: 9000, payer_id: 'p1' } },
    {
      target_kind: 'expected_primary',
      target_id: 'primary',
      reason: 'Hotel confirmed no commission',
      denied_at: '2026-11-25T00:00:00.000Z',
    },
  );
  assert.equal(isMoneyBackDenied(operational, 'expected_primary', 'primary'), true);
  const lines = buildMoneyBackLines({
    bookingId: 'b1',
    operational: operational as any,
    commissions: [],
  });
  assert.equal(lines[0].status, 'denied');
  const follow = expectedCommissionFollowUps(
    [
      {
        id: 'b1',
        code: 'QA-1',
        customer: 'A',
        product: 'Hotel',
        itinerary: { operational_entry: operational as any },
      },
    ],
    [],
  );
  assert.equal(follow.length, 0);
  assert.throws(() =>
    appendMoneyBackDenial(operational, {
      target_kind: 'expected_primary',
      target_id: 'primary',
      reason: 'again',
      denied_at: '2026-11-25T00:00:00.000Z',
    }),
  );
});

let db: Database, owner: Actor;
const ownerPassword = 'Synthetic owner password for Money Back void tests';
const date = '2026-11-25';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'MB Owner',
    email: 'mb-owner@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

test('void_money_back appends void and blocks double void', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'MB Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'MB Hotel', roles: ['seller'] },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Money Back void case',
      booked_on: date,
      travel_start: '2026-12-10',
      travel_end: '2026-12-12',
      sale: 50000,
    },
  });
  // Seed expected Money Back on itinerary (presentation path; not a new receivable).
  await db.query(
    `UPDATE bookings SET itinerary = jsonb_set(
       COALESCE(itinerary, '{}'::jsonb),
       '{operational_entry}',
       $2::jsonb
     ) WHERE id=$1`,
    [
      booking.id,
      JSON.stringify({
        version: 1,
        sale_known: true,
        how_booked: 'Hotel with commission',
        commission: { expected: 'Yes', amount: 4500, payer_id: supplier.id },
      }),
    ],
  );
  const voided = await execute(db, owner, {
    id: randomUUID(),
    kind: 'void_money_back',
    data: {
      booking_id: booking.id,
      target_kind: 'expected_primary',
      target_id: 'primary',
      date,
      reason: 'Stay cancelled — no hotel commission',
    },
  });
  assert.equal(voided.status, 'voided');
  const saved = await one(db, 'SELECT itinerary FROM bookings WHERE id=$1', [booking.id]);
  assert.equal(
    isMoneyBackVoided(saved.itinerary.operational_entry, 'expected_primary', 'primary'),
    true,
  );
  const lines = buildMoneyBackLines({
    bookingId: booking.id,
    operational: saved.itinerary.operational_entry,
    commissions: [],
  });
  assert.equal(lines.find((l) => l.source.kind === 'expected_primary')?.status, 'voided');
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'void_money_back',
        data: {
          booking_id: booking.id,
          target_kind: 'expected_primary',
          target_id: 'primary',
          date,
          reason: 'again',
        },
      }),
    /already voided/i,
  );
});

test('deny_money_back appends denial and blocks void after deny', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'MB Deny Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'MB Deny Hotel', roles: ['seller'] },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Money Back deny case',
      booked_on: date,
      travel_start: '2026-12-10',
      travel_end: '2026-12-12',
      sale: 50000,
    },
  });
  await db.query(
    `UPDATE bookings SET itinerary = jsonb_set(
       COALESCE(itinerary, '{}'::jsonb),
       '{operational_entry}',
       $2::jsonb
     ) WHERE id=$1`,
    [
      booking.id,
      JSON.stringify({
        version: 1,
        sale_known: true,
        how_booked: 'Hotel with commission',
        commission: { expected: 'Yes', amount: 4500, payer_id: supplier.id },
      }),
    ],
  );
  const denied = await execute(db, owner, {
    id: randomUUID(),
    kind: 'deny_money_back',
    data: {
      booking_id: booking.id,
      target_kind: 'expected_primary',
      target_id: 'primary',
      date,
      reason: 'Hotel said no commission on this stay',
    },
  });
  assert.equal(denied.status, 'denied');
  const saved = await one(db, 'SELECT itinerary FROM bookings WHERE id=$1', [booking.id]);
  assert.equal(
    isMoneyBackDenied(saved.itinerary.operational_entry, 'expected_primary', 'primary'),
    true,
  );
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'void_money_back',
        data: {
          booking_id: booking.id,
          target_kind: 'expected_primary',
          target_id: 'primary',
          date,
          reason: 'cannot void after deny',
        },
      }),
    /already denied/i,
  );
});

test('deduct_money_back appends deduction, reverses accrual, caps receipt', async () => {
  const customer = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'person', name: 'MB Deduct Customer', roles: ['customer', 'traveler'] },
  });
  const supplier = await execute(db, owner, {
    id: randomUUID(),
    kind: 'party',
    data: { kind: 'supplier', name: 'MB Deduct Sruly', roles: ['seller'] },
  });
  const booking = await execute(db, owner, {
    id: randomUUID(),
    kind: 'booking',
    data: {
      customer_id: customer.id,
      supplier_id: supplier.id,
      product: 'Hotel',
      channel: 'Direct',
      summary: 'Money Back deduct case',
      booked_on: date,
      travel_start: '2026-12-10',
      travel_end: '2026-12-12',
      sale: 80000,
    },
  });
  const commission = await execute(db, owner, {
    id: randomUUID(),
    kind: 'commission',
    data: {
      booking_id: booking.id,
      payer_id: supplier.id,
      gross: 10000,
      retained: 1000,
      due_on: date,
      date,
    },
  });
  const deducted = await execute(db, owner, {
    id: randomUUID(),
    kind: 'deduct_money_back',
    data: {
      booking_id: booking.id,
      target_kind: 'commission',
      target_id: commission.id,
      amount: 2500,
      date,
      reason: 'Sruly remittance deducted $25',
    },
  });
  assert.equal(deducted.how_received, 'deducted');
  assert.equal(deducted.amount, 2500);
  assert.equal(deducted.status, 'confirmed');
  const saved = await one(db, 'SELECT itinerary FROM bookings WHERE id=$1', [booking.id]);
  assert.equal(
    moneyBackDeductedCents(saved.itinerary.operational_entry, 'commission', commission.id),
    2500,
  );
  const accrual = await one(
    db,
    `SELECT COALESCE(sum(amount),0)::bigint AS amount FROM profit_movements
     WHERE booking_id=$1 AND kind='commission_accrual'`,
    [booking.id],
  );
  assert.equal(Number(accrual.amount), 9000 - 2500);
  const lines = buildMoneyBackLines({
    bookingId: booking.id,
    operational: saved.itinerary.operational_entry,
    commissions: [
      {
        id: commission.id,
        booking_id: booking.id,
        gross: 10000,
        retained: 1000,
        received: 0,
        payer: 'MB Deduct Sruly',
      },
    ],
  });
  assert.equal(lines[0].expectedCents, 6500);
  assert.equal(lines[0].deductedCents, 2500);
  assert.equal(lines[0].status, 'confirmed');

  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'deduct_money_back',
        data: {
          booking_id: booking.id,
          target_kind: 'commission',
          target_id: commission.id,
          amount: 7000,
          date,
          reason: 'too much',
        },
      }),
    /exceeds outstanding/i,
  );

  const settled = await execute(db, owner, {
    id: randomUUID(),
    kind: 'deduct_money_back',
    data: {
      booking_id: booking.id,
      target_kind: 'commission',
      target_id: commission.id,
      amount: 6500,
      date,
      reason: 'Write off remainder as deducted',
    },
  });
  assert.equal(settled.status, 'received');
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'void_money_back',
        data: {
          booking_id: booking.id,
          target_kind: 'commission',
          target_id: commission.id,
          date,
          reason: 'cannot void after deduct',
        },
      }),
    /already has deductions/i,
  );
});
