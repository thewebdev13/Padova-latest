import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, financialEmployee, testOwner } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { parseQuickPaste, parsePaymentStatus, parseBoughtValue } from '../src/lib/quick-paste';
import {
  transitionBookingProduct,
  bookingProductDetails,
  customerReceivedAmount,
  sellerPaymentState,
  assertBookingProductData,
} from '../src/lib/booking-entry-state';
import {
  redactOperationalText,
  redactOperationalValue,
  sanitizeOperationalInput,
} from '../src/lib/operational-redaction';
import { csvCell } from '../src/lib/csv';

test('red-team PDV-1566: exact payment statuses never turn Unpaid or ambiguous claims into receipts', () => {
  for (const value of ['Unpaid', 'No', '  UNPAID  ']) {
    const preview = parseQuickPaste(`Customer Paid: ${value}`);
    assert.equal(parsePaymentStatus(preview.fields.customer_paid), 'Unpaid');
    assert.equal(
      customerReceivedAmount(
        parsePaymentStatus(preview.fields.customer_paid)!,
        92500,
        92500,
        false,
      ),
      0,
    );
  }
  for (const value of [
    'not paid',
    'paid later',
    'Yes / No',
    'Partially paid',
    'constructor',
    '__proto__',
  ]) {
    const preview = parseQuickPaste(`Customer Paid: ${value}`);
    assert.equal(parsePaymentStatus(preview.fields.customer_paid), undefined);
    assert.ok(preview.issues.some((i) => i.includes('unresolved')));
    assert.equal(customerReceivedAmount('', undefined, 92500, false), 0);
  }
  assert.equal(parsePaymentStatus(' Yes '), 'Paid');
  assert.equal(customerReceivedAmount('Paid', undefined, 92500, false), 92500);
  assert.ok(
    parseQuickPaste('Customer Paid: Partial').issues.some((i) => i.includes('actual amount')),
  );
  assert.equal(customerReceivedAmount('Partial', 2500, 92500, true), 2500);
});

test('red-team PDV-1567: manual and Quick Paste use the same product normalization and serialization', () => {
  const flight = {
    product: 'Flight',
    provider_id: 'airline',
    primary_reference: 'PNR',
    trip_type: 'Round Trip',
    travel_end: '2027-02-02',
    route: 'A-B',
    flight_numbers: 'QA123',
    ticket_numbers: '2200000000004',
    cabin: 'Business',
    airline_id: 'airline',
    hotel: 'stale',
    room_type: 'stale',
    pickup_location: 'stale',
    commission_amount: '100',
  };
  const manual = transitionBookingProduct(flight, 'Hotel');
  const pasted = parseQuickPaste('Product: Hotel\nRoom Type: King');
  const applied = transitionBookingProduct(
    { ...flight, room_type: pasted.fields.room_type },
    pasted.fields.product,
  );
  for (const next of [manual, applied]) {
    for (const key of [
      'route',
      'flight_numbers',
      'ticket_numbers',
      'cabin',
      'airline_id',
      'trip_type',
      'pickup_location',
    ])
      assert.equal(next[key], undefined, key);
    assert.equal(next.primary_reference, '');
    assert.equal(next.travel_end, '');
    const details = bookingProductDetails(next, 'QA Hotel');
    assert.equal(details.flight_numbers, undefined);
    assert.equal(details.ticket_numbers, undefined);
  }
  const back = transitionBookingProduct(
    { ...manual, hotel: 'QA Hotel', location: 'QA address', room_type: 'King' },
    'Flight',
  );
  assert.equal(back.room_type, undefined);
  assert.equal(back.location, undefined);
  assert.equal(back.commission_amount, undefined);
  assert.equal(
    transitionBookingProduct({ ...flight, trip_type: 'One Way' }, 'Flight').travel_end,
    '',
  );
  assert.throws(
    () => assertBookingProductData('Hotel', { flight_numbers: ['QA123'] }),
    /incompatible/,
  );
  assert.throws(() => assertBookingProductData('Flight', { room_type: 'King' }), /incompatible/);
  assert.throws(
    () =>
      assertBookingProductData('Hotel', {}, [{ type: 'ticket_number', value: '2200000000004' }]),
    /incompatible/,
  );
});

test('Quick Paste retains unparsed text, maps supplied value explicitly and flags contradictory return dates', () => {
  const preview = parseQuickPaste(
    'Preserve this unlabelled instruction\nCustomer: QA Customer\nMore unlabelled context\nTrip Type: One Way Return: 2026-12-01',
  );
  assert.equal(preview.unknown.filter((v) => v.label === 'Unparsed / Needs Review').length, 2);
  assert.ok(preview.issues.some((i) => i.startsWith('Contradiction:')));
  for (const [input, expected] of [
    ['points', 'Points / Miles'],
    ['miles', 'Points / Miles'],
    ['voucher', 'Voucher / Travel Credit'],
    ['travel credit', 'Voucher / Travel Credit'],
    ['certificate', 'Certificate / Award'],
    ['complete booking', 'Complete Booking / Ticket'],
  ])
    assert.equal(parseBoughtValue(input)?.supplied, expected);
  assert.equal(parseBoughtValue('something else'), undefined);
  assert.ok(parseQuickPaste('Bought: something else').issues.some((i) => i.includes('unresolved')));
});

test('seller status follows actual money: 650 cost, 50 paid, 600 due', () => {
  assert.deepEqual(sellerPaymentState(65000, 5000, 'Paid'), {
    paid: 5000,
    payment_known: true,
    balance: 60000,
    status: 'Partial',
  });
  assert.equal(sellerPaymentState(65000, 0, 'Paid').status, 'Unpaid');
  assert.equal(sellerPaymentState(65000, undefined, 'Unpaid').payment_known, false);
  assert.equal(sellerPaymentState(65000, 0, 'Unpaid').payment_known, true);
  assert.equal(sellerPaymentState(65000, 65000, 'Partial').status, 'Paid');
  assert.equal(sellerPaymentState(0, 0, 'Paid').status, 'No payment due');
});

test('synthetic card separators redact consistently while typed tickets and restricted originals survive', () => {
  // Generate a synthetic candidate and checksum locally; assertions never print its digits.
  const stem = Array.from({ length: 15 }, (_, i) => String(i === 0 ? 4 : (i * 3 + 2) % 10)).join(
    '',
  );
  const valid = (value: string) => {
    let sum = 0;
    for (let i = value.length - 1, double = false; i >= 0; i--, double = !double) {
      let d = Number(value[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  };
  const candidate =
    stem + Array.from({ length: 10 }, (_, i) => String(i)).find((d) => valid(stem + d));
  for (const separator of [' ', '-', '.']) {
    const formatted = candidate.match(/.{1,4}/g)!.join(separator);
    const raw = `Operational note ${formatted}`;
    assert.ok(redactOperationalText(raw).includes('[REDACTED payment number]'));
    assert.ok(!JSON.stringify(redactOperationalValue({ notes: raw })).includes(formatted));
    assert.ok(!csvCell(raw).includes(formatted));
    const original = { raw_text: raw };
    const sanitized = sanitizeOperationalInput({ notes: raw, source_provenance: original });
    assert.ok(!sanitized.notes.includes(formatted));
    assert.ok(sanitized.source_provenance === original);
    assert.ok(original.raw_text === raw);
  }
  const ticket = { type: 'ticket_number', value: '2200000000004' };
  assert.deepEqual(redactOperationalValue(ticket), ticket);
  assert.deepEqual(sanitizeOperationalInput({ ticket_numbers: [ticket.value] }), {
    ticket_numbers: [ticket.value],
  });
});

test('domain rejects forged Employee funding/taxes/product data atomically; ordinary operational entry succeeds', async () => {
  const db = await financialDatabase();
  const run = (actor: any, data: any) =>
    execute(db, actor, { id: randomUUID(), kind: 'booking', data });
  try {
    const employee = await financialEmployee(db);
    const customer = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'party',
      data: { name: 'Red-team synthetic customer', kind: 'person', roles: ['customer'] },
    });
    const make = () => ({
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'Synthetic red-team regression',
      booked_on: '2026-10-30',
      travel_start: '2027-02-01',
      travel_end: '2027-02-01',
      itinerary: { cost_status: 'Pending' },
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Synthetic one-way',
          travel_start: '2027-02-01',
          travel_end: '2027-02-01',
          details: { trip_type: 'One Way', end_date_known: false },
        },
      ],
      operational: { version: 1, sale_known: false, trip_type: 'One Way', components: [] },
    });
    const snapshot = async () =>
      Promise.all(
        [
          'bookings',
          'payments',
          'payment_allocations',
          'supplier_obligations',
          'journal_lines',
          'funding_components',
          'commands',
        ].map(async (table) =>
          Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n),
        ),
      );
    for (const taxes of [
      { amount: 3000, bearer: 'Padova', method: 'Cash' },
      { amount: 3000, bearer: 'Seller', owed_to_seller: true, seller_id: randomUUID() },
    ]) {
      const before = await snapshot();
      await assert.rejects(
        () => run(employee, { ...make(), operational: { ...make().operational, taxes } }),
        /manage_funding/,
      );
      assert.deepEqual(await snapshot(), before);
    }
    await assert.rejects(
      () =>
        run(employee, {
          ...make(),
          operational: {
            ...make().operational,
            components: [{ type: 'Outside seller', date: '2026-10-30' }],
          },
        }),
      /manage_funding/,
    );
    for (const bearer of ['Customer', 'Seller', 'Included in Seller Price']) {
      const b = await run(employee, {
        ...make(),
        operational: { ...make().operational, taxes: { amount: 3000, bearer } },
      });
      assert.equal(
        Number(
          (await db.query('SELECT count(*) n FROM funding_components WHERE booking_id=$1', [b.id]))
            .rows[0].n,
        ),
        0,
      );
    }
    const ticket = '2200000000004';
    const basic = await run(employee, {
      ...make(),
      operational: {
        ...make().operational,
        references: [{ type: 'ticket_number', value: ticket }],
      },
    });
    assert.ok(basic.id);
    assert.equal(
      (
        await db.query(
          "SELECT value FROM booking_references WHERE booking_id=$1 AND reference_type='ticket_number'",
          [basic.id],
        )
      ).rows[0].value,
      ticket,
    );
    for (const table of ['charges', 'journal_lines', 'payment_allocations'])
      assert.equal(
        Number(
          (await db.query(`SELECT count(*) n FROM ${table} WHERE booking_id=$1`, [basic.id]))
            .rows[0].n,
        ),
        0,
      );
    assert.equal(
      (await db.query('SELECT count(*) n FROM funding_components WHERE booking_id=$1', [basic.id]))
        .rows[0].n,
      0,
    );
    const unpaid = parseQuickPaste('Customer Price: 925\nCustomer Paid: Unpaid');
    const received = customerReceivedAmount(
      parsePaymentStatus(unpaid.fields.customer_paid)!,
      undefined,
      92500,
      false,
    );
    const beforePayments = (await db.query('SELECT count(*) n FROM payments')).rows[0].n;
    const b = await run(testOwner, {
      ...make(),
      sale: 92500,
      operational: { ...make().operational, sale_known: true },
      ...(received
        ? {
            customer_payment: {
              amount: received,
              date: '2026-10-30',
              method: 'Cash',
              allocate_to_booking: true,
            },
          }
        : {}),
    });
    assert.equal((await db.query('SELECT count(*) n FROM payments')).rows[0].n, beforePayments);
    assert.equal(
      (await db.query('SELECT count(*) n FROM payment_allocations WHERE booking_id=$1', [b.id]))
        .rows[0].n,
      0,
    );
    assert.equal((await economics(db, b.id)).customer_balance, 92500);
    const seller = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'party',
      data: { name: 'Synthetic partial seller', kind: 'person', roles: ['seller'] },
    });
    const settlement = sellerPaymentState(65000, 5000, 'Paid');
    const partial = await run(testOwner, {
      ...make(),
      operational: {
        ...make().operational,
        components: [
          {
            type: 'Outside seller',
            seller_id: seller.id,
            cost: 65000,
            paid: settlement.paid,
            date: '2026-10-30',
            method: 'Cash',
          },
        ],
      },
    });
    const actual = await economics(db, partial.id);
    assert.equal(Number(actual.supplier_paid), 5000);
    assert.equal(actual.supplier_balance, 60000);
    const forged = make();
    await assert.rejects(
      () =>
        run(testOwner, {
          ...forged,
          operational: undefined,
          travel_components_input: undefined,
          itinerary: { trip_type: 'One Way' },
          travel_end: '2027-02-03',
        }),
      /One Way/,
    );
    await assert.rejects(
      () =>
        run(testOwner, {
          ...forged,
          product: 'Hotel',
          travel_components_input: [
            {
              ...forged.travel_components_input[0],
              product: 'Hotel',
              details: { flight_numbers: ['QA123'] },
            },
          ],
        }),
      /incompatible/,
    );
    await assert.rejects(
      () =>
        run(testOwner, {
          ...forged,
          product: 'Hotel',
          travel_components_input: undefined,
          operational: {
            ...forged.operational,
            trip_type: undefined,
            references: [{ type: 'ticket_number', value: '2200000000004' }],
          },
        }),
      /incompatible/,
    );
    await assert.rejects(
      () =>
        run(testOwner, {
          ...forged,
          travel_components_input: [
            { ...forged.travel_components_input[0], travel_end: '2027-02-02' },
          ],
        }),
      /One Way/,
    );
    await assert.rejects(
      () => run(testOwner, { ...forged, product: 'Other', travel_components_input: undefined }),
      /description|what|Other/i,
    );
  } finally {
    await db.close();
  }
});
