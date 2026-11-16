import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { parseQuickPaste, exactEligibleMatch, exactPointCost } from '../src/lib/quick-paste';
import {
  redactOperationalText,
  redactOperationalValue,
  sanitizeOperationalInput,
} from '../src/lib/operational-redaction';
import { importPracticeFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';
import { accountSupports, eligibleParty } from '../src/lib/directory-eligibility';

test('Quick Paste protocol retains unknowns, exact eligible matches, whole points and safe operational text', () => {
  const p = parseQuickPaste(
    'Customer: ABC Corp Traveler: David Cohen Product: Flight Trip Type: Round Trip Airline: Delta Route: EWR-TLV-EWR Departure: 2026-11-10 Return: 2026-11-17 PNR: ABC123 Booked Through: Award Booking Program: Delta SkyMiles Seller: Moshe Cohen Bought: 50000 miles Seller Cost: 700 Seller Paid: Yes Taxes: 30 Taxes Paid By: Padova Card: Amex 1234 Customer Price: 925 Customer Paid: Yes Notes: Window seat requested\nUnrecognized: retained',
  );
  assert.equal(p.fields.customer, 'ABC Corp');
  assert.equal(p.fields.traveler, 'David Cohen');
  assert.equal(p.fields.method, 'Award Booking');
  assert.equal(p.fields.seller_cost, '700');
  assert.equal(p.fields.notes, 'Window seat requested');
  assert.equal(p.unknown[0].value, 'retained');
  assert.equal(exactPointCost(50000, '0.013', 'USD per point'), 65000);
  assert.equal(exactPointCost(50000, '13', 'USD per 1,000 points'), 65000);
  assert.equal(exactPointCost(50000, '1.3', 'cents per point'), 65000);
  assert.throws(() => exactPointCost(1, '0.001', 'USD per point'), /fractional/);
  const party = { id: randomUUID(), name: 'Delta', kind: 'company', roles: ['issuer'] };
  assert.equal(exactEligibleMatch([party], 'Delta', 'airline'), undefined);
  assert.equal(eligibleParty({ ...party, roles: ['supplier'] }, 'airline'), false);
  assert.equal(
    exactEligibleMatch(
      [
        { ...party, roles: ['airline'] },
        { ...party, id: randomUUID(), roles: ['airline'] },
      ],
      'Delta',
      'airline',
    ),
    undefined,
  );
  assert.equal(
    accountSupports({ kind: 'Bank', ownership: 'Padova', supported_methods: ['Wire'] }, 'Card'),
    false,
  );
  assert.equal(
    accountSupports({ kind: 'Card', ownership: 'Unknown', supported_methods: ['Card'] }, 'Card'),
    false,
  );
  // Construct a synthetic test number; never read/print restricted source values.
  assert.equal(
    redactOperationalText(['4111', '1111', '1111', '1111'].join(' ')),
    '[REDACTED payment number]',
  );
  const id = '12345678-1234-4123-8123-123456789012';
  assert.equal(redactOperationalText(id), id);
  const ticket = { type: 'ticket_number', value: '2200000000004' };
  assert.deepEqual(redactOperationalValue(ticket), ticket);
  assert.deepEqual(sanitizeOperationalInput({ ticket_numbers: [ticket.value] }), {
    ticket_numbers: [ticket.value],
  });
  assert.equal(
    redactOperationalText('Card: ' + ['12345', '67890', '12345'].join('')),
    'Card: [REDACTED payment number]',
  );
});

test('role rejection, conditional branches, tax economics and exact many-to-many seller settlement', async (t) => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'QA Customer',
      kind: 'company',
      roles: ['customer'],
    });
    const seller = await run('party', { name: 'QA Seller', kind: 'person', roles: ['seller'] });
    const airline = await run('party', { name: 'QA Airline', kind: 'company', roles: ['airline'] });
    const method = (await db.query("SELECT * FROM booking_source_methods WHERE name='GDS'"))
      .rows[0];
    const program = await run('program', { name: 'QA SkyMiles', category: 'Airline' });
    const card = await run('payment_account', {
      name: 'QA Padova Card',
      kind: 'Card',
      ownership: 'Padova',
    });
    const make = (components: any[] = []) => ({
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'QA route',
      booked_on: '2026-10-29',
      travel_start: '2026-11-10',
      travel_end: '2026-11-10',
      sale: 92500,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'QA route',
          provider_id: airline.id,
          travel_start: '2026-11-10',
          travel_end: '2026-11-10',
          details: { end_date_known: false },
        },
      ],
      operational: {
        version: 1,
        trip_type: 'One Way',
        sale_known: true,
        source_method_id: method.id,
        components,
      } as any,
    });
    const outside = {
      type: 'Outside seller',
      seller_id: seller.id,
      supplied: 'Points / Miles',
      unit: 'points',
      quantity: 50000,
      cost: 65000,
      date: '2026-10-29',
    };
    await t.test(
      'legacy command paths cannot bypass explicit customer eligibility; Other requires description',
      async () => {
        const data: any = make();
        delete data.operational;
        data.customer_id = airline.id;
        await assert.rejects(run('booking', data), /eligible as customer/);
        const other: any = make();
        other.product = 'Other';
        other.operational.trip_type = undefined;
        other.travel_components_input[0].provider_id = null;
        await assert.rejects(run('booking', other), /Describe/);
      },
    );
    for (const [name, roles, kind] of [
      ['Customer', ['customer'], 'person'],
      ['Traveler', ['traveler'], 'person'],
      ['Hilton', ['hotel_brand'], 'company'],
      ['Capital One', ['issuer'], 'company'],
    ] as const)
      await t.test(`reject ${name} as airline`, async () => {
        const wrong = await run('party', { name, kind, roles });
        const data = make([outside]);
        data.travel_components_input[0].provider_id = wrong.id;
        await assert.rejects(run('booking', data), /eligible as airline/);
      });
    await t.test(
      'reject stale Award program, one-way return, customer-card account, certificate point rate and incompatible card account',
      async () => {
        const award = make([outside]);
        award.operational.award_program_id = program.id;
        await assert.rejects(run('booking', award), /Non-award/);
        const date = make([outside]);
        date.travel_end = '2026-11-17';
        await assert.rejects(run('booking', date), /One Way/);
        await assert.rejects(
          run(
            'booking',
            make([
              {
                type: 'Customer card',
                owner_id: customer.id,
                cost: 50000,
                account_id: card.id,
                date: '2026-10-29',
              },
            ]),
          ),
          /not a Padova/,
        );
        await assert.rejects(
          run(
            'booking',
            make([{ ...outside, supplied: 'Certificate / Award', quoted_rate: '0.013' }]),
          ),
          /Certificate|incompatible/,
        );
        const bank = await run('payment_account', { name: 'QA bank', kind: 'Bank' });
        await assert.rejects(
          run(
            'booking',
            make([
              {
                type: 'Padova payment',
                cost: 10000,
                method: 'Card',
                account_id: bank.id,
                date: '2026-10-29',
              },
            ]),
          ),
          /not eligible/,
        );
      },
    );
    await t.test(
      'Delta one-way points plus Padova tax costs 680; included/customer/seller-borne taxes never double count',
      async () => {
        for (const bearer of ['Padova', 'Included in Seller Price', 'Customer', 'Seller']) {
          const data = make([{ ...outside, paid: 65000, method: 'Wire' }]);
          data.operational.taxes = {
            amount: 3000,
            bearer,
            method: bearer === 'Padova' ? 'Card' : undefined,
            account_id: bearer === 'Padova' ? card.id : undefined,
          };
          const b = await run('booking', data),
            e = await economics(db, b.id);
          assert.equal(e.funding_cost, bearer === 'Padova' ? 68000 : 65000);
          assert.equal(e.supplier_balance, 0);
        }
      },
    );
    await t.test(
      'two obligations, one payment and multiple partial payments settle exact obligations',
      async () => {
        const b = await run(
          'booking',
          make([
            { ...outside, cost: 40000 },
            { ...outside, cost: 25000 },
          ]),
        );
        const obligations = (
          await db.query(
            'SELECT * FROM supplier_obligations WHERE booking_id=$1 ORDER BY amount DESC',
            [b.id],
          )
        ).rows;
        await assert.rejects(
          run('payment', {
            party_id: seller.id,
            direction: 'supplier',
            amount: 100,
            date: '2026-10-29',
            method: 'Wire',
            allocations: [{ booking_id: b.id, amount: 100 }],
          }),
          /exact seller obligation/,
        );
        const pay = await run('payment', {
          party_id: seller.id,
          direction: 'supplier',
          amount: 30000,
          date: '2026-10-29',
          method: 'Wire',
          allocations: [
            { booking_id: b.id, obligation_id: obligations[0].id, amount: 20000 },
            { booking_id: b.id, obligation_id: obligations[1].id, amount: 10000 },
          ],
        });
        assert.ok(pay.id);
        await run('payment', {
          party_id: seller.id,
          direction: 'supplier',
          amount: 35000,
          date: '2026-10-29',
          method: 'Wire',
          allocations: [
            { booking_id: b.id, obligation_id: obligations[0].id, amount: 20000 },
            { booking_id: b.id, obligation_id: obligations[1].id, amount: 15000 },
          ],
        });
        assert.equal((await economics(db, b.id)).supplier_balance, 0);
        assert.equal(
          (await db.query('SELECT count(*) n FROM obligation_settlements')).rows[0].n >= 4,
          true,
        );
        await assert.rejects(
          run('payment', {
            party_id: seller.id,
            direction: 'supplier',
            amount: 1,
            date: '2026-10-29',
            method: 'Wire',
            allocations: [{ booking_id: b.id, obligation_id: obligations[0].id, amount: 1 }],
          }),
          /mismatch|exceeds/,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test('reviewed Practice financial importer is atomic, replay-safe and rejects changed source events', async () => {
  const db = await financialDatabase();
  try {
    if (db.storage === 'padova') {
      await assert.rejects(importPracticeFinancialPlan(db, testOwner, []), /not authorized/);
      return;
    }
    const evidence_id = randomUUID(),
      source = {
        source_system: 'synthetic-final-QA',
        source_key: 'stable-row-id',
        evidence_id,
        source_locator: { workbook: 'QA', tab: 'QA', row: 1 },
        reviewer_decision: 'Explicit synthetic QA approval',
      };
    const event = (event_role: string, kind: any, data: any): ImportEvent => ({
      ...source,
      event_role,
      kind,
      data,
    });
    const ref = (role: string) => ({ $event: role });
    const plan = [
      event('customer', 'party', {
        name: 'Import QA customer',
        kind: 'person',
        roles: ['customer'],
      }),
      event('seller', 'party', { name: 'Import QA seller', kind: 'person', roles: ['seller'] }),
      event('booking', 'booking', {
        customer_id: ref('customer'),
        supplier_id: ref('seller'),
        product: 'Flight',
        channel: 'Direct',
        summary: 'Replay QA',
        booked_on: '2026-10-29',
        travel_start: '2026-11-10',
        travel_end: '2026-11-10',
        sale: 92500,
      }),
      event('funding', 'fund', {
        booking_id: ref('booking'),
        seller_id: ref('seller'),
        kind: 'Complete ticket',
        face_amount: 65000,
        cost: 65000,
        date: '2026-10-29',
      }),
      event('receipt', 'payment', {
        party_id: ref('customer'),
        direction: 'customer',
        amount: 92500,
        date: '2026-10-29',
        method: 'Wire',
        allocations: [{ booking_id: ref('booking'), amount: 92500 }],
      }),
      event('seller-payment', 'payment', {
        party_id: ref('seller'),
        direction: 'supplier',
        amount: 65000,
        date: '2026-10-29',
        method: 'Wire',
        allocations: [{ booking_id: ref('booking'), amount: 65000 }],
      }),
    ];
    const first = await importPracticeFinancialPlan(db, testOwner, plan);
    assert.equal(first.created, 6);
    const counts = async () =>
      (
        await db.query(
          'SELECT (SELECT count(*) FROM bookings) bookings,(SELECT count(*) FROM charges) charges,(SELECT count(*) FROM payments) payments,(SELECT count(*) FROM payment_allocations) allocations,(SELECT count(*) FROM supplier_obligations) obligations,(SELECT count(*) FROM journal_lines) journal,(SELECT count(*) FROM parties) parties',
        )
      ).rows[0];
    const before = await counts();
    assert.equal((await importPracticeFinancialPlan(db, testOwner, plan)).created, 0);
    assert.deepEqual(await counts(), before);
    const changed = structuredClone(plan);
    changed[2].data.sale = 92600;
    await assert.rejects(
      importPracticeFinancialPlan(db, testOwner, changed),
      /different|reuse|payload|Idempotency/i,
    );
    assert.deepEqual(await counts(), before);
    const failed = [
      ...plan,
      event('invalid', 'payment', {
        party_id: ref('customer'),
        direction: 'customer',
        amount: 999999,
        date: '2026-10-29',
        method: 'Wire',
        allocations: [{ booking_id: ref('booking'), amount: 999999 }],
      }),
    ];
    await assert.rejects(importPracticeFinancialPlan(db, testOwner, failed));
    assert.deepEqual(await counts(), before);
  } finally {
    await db.close();
  }
});
