import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfitByMonth,
  buildYearEndExportPack,
  rowsToCsv,
  yearEndFileNames,
} from '../src/lib/year-end-export';

test('profit by month keeps incomplete separate and never invents zero', () => {
  const rows = buildProfitByMonth([
    { booked_on: '2026-01-10', profit: 10000, reservation_status: 'Booked' },
    { booked_on: '2026-01-15', profit: null, reservation_status: 'Booked' },
    { booked_on: '2026-02-01', profit: 5000, reservation_status: 'Booked' },
    { booked_on: '2026-02-02', profit: 2000, reservation_status: 'Cancelled' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].month, '2026-02');
  assert.equal(rows[0].confirmed_profit_usd, '50.00');
  assert.equal(rows[1].month, '2026-01');
  assert.equal(rows[1].confirmed_profit_usd, '100.00');
  assert.equal(rows[1].incomplete_bookings, 1);
  assert.equal(
    buildProfitByMonth([{ booked_on: '2026-03-01', profit: null }])[0].confirmed_profit_usd,
    'incomplete',
  );
});

test('year-end pack filters by year and blanks unknown money', () => {
  const pack = buildYearEndExportPack({
    year: 2026,
    bookings: [
      {
        code: 'A',
        booked_on: '2026-05-01',
        sale: 10000,
        profit: null,
        customer: 'C',
      },
      { code: 'B', booked_on: '2025-12-01', sale: 999, profit: 1 },
    ],
    payments: [
      { paid_on: '2026-06-01', direction: 'customer', amount: 5000, party: 'C' },
      { paid_on: '2025-01-01', direction: 'customer', amount: 1, party: 'X' },
    ],
    commissions: [{ due_on: '2026-07-01', gross: 900, code: 'A', payer: 'Sruly' }],
    referrals: [{ id: 'r1', referrer: 'Chabad', booking_id: 'b1' }],
    referralPayments: [
      { paid_on: '2026-08-01', referral_id: 'r1', amount: 1500, method: 'Zelle' },
    ],
  });
  assert.equal(pack.bookings.length, 1);
  assert.equal(pack.bookings[0].profit_usd, '');
  assert.equal(pack.bookings[0].sale_usd, '100.00');
  assert.equal(pack.payments.length, 1);
  assert.equal(pack.commissions.length, 1);
  assert.equal(pack.referrer_payments.length, 1);
  assert.equal(pack.referrer_payments[0].referrer, 'Chabad');
  assert.equal(yearEndFileNames(2026).bookings, 'padova-2026-bookings.csv');
  assert.match(rowsToCsv(pack.bookings), /sale_usd/);
});
