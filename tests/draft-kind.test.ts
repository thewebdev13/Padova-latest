import assert from 'node:assert/strict';
import test from 'node:test';
import { draftKind } from '../src/lib/draft-kind';

test('held historical voucher sales do not resume as bookings', () => {
  assert.equal(
    draftKind({
      summary: 'Voucher ending123456 sold to Example Customer',
      historical_status: 'Held — original cost',
    }),
    'voucher_sale',
  );
  assert.equal(
    draftKind({
      summary: 'Voucher ending 123456 sold to Example Customer',
      historical_status: 'Held',
    }),
    'voucher_sale',
  );
});

test('voucher-funded flights and ordinary booking drafts remain bookings', () => {
  assert.equal(
    draftKind({ summary: 'Flight paid with voucher 123456', historical_status: 'Held' }),
    'historical_booking',
  );
  assert.equal(draftKind({ summary: 'Voucher ending123456 sold to Example Customer' }), 'booking');
  assert.equal(draftKind({}), 'booking');
});
