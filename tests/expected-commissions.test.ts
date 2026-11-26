import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildLumpCommissionPaymentDefaults,
  expectedCommissionFollowUps,
  paymentAllocationStatus,
  expectedCommissionMatchesSearch,
  paymentMatchesAllocationFilter,
  paymentMatchesSearch,
  paymentUnallocatedCents,
  paymentUnallocatedColumnLabel,
} from '../src/lib/expected-commissions';

test('expected commissions list only bookings without a posted receivable', () => {
  const rows = expectedCommissionFollowUps(
    [
      {
        id: 'b1',
        code: 'QA-1',
        customer: 'Ada',
        product: 'Hotel',
        itinerary: {
          operational_entry: {
            how_booked: 'Hotel with commission',
            commission: { expected: 'Yes', notes: 'Sruly' },
          },
        },
      },
      {
        id: 'b2',
        code: 'QA-2',
        customer: 'Bob',
        product: 'Hotel',
        itinerary: {
          operational_entry: { commission: { expected: 'Yes', amount: 10000 } },
        },
      },
    ],
    [{ booking_id: 'b2' }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].booking_id, 'b1');
  assert.equal(rows[0].amount, null);
});

test('Allocate remaining is zero when fully allocated', () => {
  assert.equal(
    paymentUnallocatedCents({
      direction: 'customer',
      current_amount: 10000,
      allocated: 10000,
      commission_allocated: 0,
    }),
    0,
  );
  assert.equal(
    paymentUnallocatedCents({
      direction: 'customer',
      current_amount: 10000,
      allocated: 4000,
      commission_allocated: 0,
    }),
    6000,
  );
});

test('Plan: cleared receipts show Fully allocated — not $0 Pending', () => {
  const cleared = {
    direction: 'customer',
    current_amount: 10000,
    allocated: 10000,
    commission_allocated: 0,
  };
  const open = {
    direction: 'customer',
    current_amount: 10000,
    allocated: 2500,
    commission_allocated: 0,
  };
  assert.equal(paymentAllocationStatus(cleared), 'cleared');
  assert.equal(paymentAllocationStatus(open), 'open');
  assert.equal(
    paymentUnallocatedColumnLabel(cleared, (c) => `$${(c / 100).toFixed(2)}`),
    'Fully allocated',
  );
  assert.equal(
    paymentUnallocatedColumnLabel(open, (c) => `$${(c / 100).toFixed(2)}`),
    '$75.00',
  );
  assert.equal(paymentMatchesAllocationFilter(cleared, 'Fully allocated'), true);
  assert.equal(paymentMatchesAllocationFilter(cleared, 'Unallocated'), false);
  assert.equal(paymentMatchesAllocationFilter(open, 'Unallocated'), true);
});

test('Payments search: party · reference · method; blank query matches all ≠ invent', () => {
  const row = {
    id: 'pay-abc123',
    party: 'Ada Lovelace',
    reference: 'Zelle-9911',
    method: 'Zelle',
    verification: 'Bank alert',
    direction: 'customer',
  };
  assert.equal(paymentMatchesSearch(row, ''), true);
  assert.equal(paymentMatchesSearch(row, null), true);
  assert.equal(paymentMatchesSearch(row, '  '), true);
  assert.equal(paymentMatchesSearch(row, 'ada'), true);
  assert.equal(paymentMatchesSearch(row, 'ZELLE-9911'), true);
  assert.equal(paymentMatchesSearch(row, 'bank alert'), true);
  assert.equal(paymentMatchesSearch(row, 'pay-abc'), true);
  assert.equal(paymentMatchesSearch(row, 'wire'), false);
  assert.equal(paymentMatchesSearch({ party: null, reference: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /paymentMatchesSearch/);
  assert.match(src, /payments-search/);
  assert.match(src, /Search party, reference or method/);
});

test('Expected lane search: booking · customer · how booked; blank query matches all ≠ invent', () => {
  const row = {
    booking_id: 'b1',
    code: 'PDV-100',
    customer: 'Ada Lovelace',
    product: 'Hotel',
    how_booked: 'Hotel with commission',
    notes: 'Sruly 90/10',
    lane: 'primary',
  };
  assert.equal(expectedCommissionMatchesSearch(row, ''), true);
  assert.equal(expectedCommissionMatchesSearch(row, null), true);
  assert.equal(expectedCommissionMatchesSearch(row, 'pdv-100'), true);
  assert.equal(expectedCommissionMatchesSearch(row, 'ADA'), true);
  assert.equal(expectedCommissionMatchesSearch(row, 'sruly'), true);
  assert.equal(expectedCommissionMatchesSearch(row, 'hotel with'), true);
  assert.equal(expectedCommissionMatchesSearch(row, 'flight'), false);
  assert.equal(expectedCommissionMatchesSearch({ code: null, customer: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/components/commissions-page.tsx'), 'utf8');
  assert.match(src, /expectedCommissionMatchesSearch/);
  assert.match(src, /Search booking #, customer or how booked/);
  assert.match(src, /lane === 'expected'/);
});

test('lump collector payment prefills outstanding nets for one shared payer', () => {
  const ok = buildLumpCommissionPaymentDefaults([
    {
      id: 'c1',
      gross: 10000,
      retained: 1000,
      received: 0,
      collector_id: 'sruly',
      payer_id: 'hotel',
    },
    {
      id: 'c2',
      gross: 5000,
      retained: 500,
      received: 1000,
      collector_id: 'sruly',
      payer_id: 'hotel',
    },
  ]);
  assert.ok(ok);
  assert.equal(ok!.party_id, 'sruly');
  assert.equal(ok!.amount, 9000 + 3500);
  assert.deepEqual(ok!.commission_allocations, [
    { commission_id: 'c1', amount: 9000 },
    { commission_id: 'c2', amount: 3500 },
  ]);
  assert.equal(
    buildLumpCommissionPaymentDefaults([
      {
        id: 'c1',
        gross: 10000,
        retained: 0,
        received: 0,
        collector_id: 'a',
      },
      {
        id: 'c2',
        gross: 10000,
        retained: 0,
        received: 0,
        collector_id: 'b',
      },
    ]),
    null,
  );
});

test('Expected commissions Copy link on receivable and expected lanes', () => {
  const page = readFileSync(join(process.cwd(), 'src/components/commissions-page.tsx'), 'utf8');
  assert.match(page, /copyBookingLink/);
  assert.match(page, /Copy shareable link/);
  assert.match(
    page,
    /copyBookingLink && c\.booking_id[\s\S]*Copy link[\s\S]*copyBookingLink && row\.booking_id[\s\S]*Copy link/,
  );
  assert.match(
    page,
    /CommissionPayables[\s\S]*openBooking=\{openBooking\}[\s\S]*copyBookingLink=\{copyBookingLink\}/,
  );
  const payables = readFileSync(
    join(process.cwd(), 'src/components/commission-payables.tsx'),
    'utf8',
  );
  assert.match(payables, /copyBookingLink && r\.booking_id[\s\S]*Copy link/);
  assert.match(payables, /openBooking\(String\(r\.booking_id\)\)/);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /CommissionsPage[\s\S]*copyBookingLink=\{\(id\) => \{[\s\S]*calendarBookingSharePath/,
  );
});
