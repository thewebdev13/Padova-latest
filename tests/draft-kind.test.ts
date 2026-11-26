import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftKind, draftMatchesSearch } from '../src/lib/draft-kind';

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

test('Drafts search: title · customer · source; blank query matches all ≠ invent', () => {
  const row = {
    id: 'draft-abc',
    title: 'JFK → TLV Cap1',
    display_title: 'Flight · JFK-TLV',
    summary: 'Capital One Travel',
    intake_product: 'Flight',
    intake_source: 'email',
    intake_customer: 'Ada Lovelace',
  };
  assert.equal(draftMatchesSearch(row, ''), true);
  assert.equal(draftMatchesSearch(row, null), true);
  assert.equal(draftMatchesSearch(row, 'jfk'), true);
  assert.equal(draftMatchesSearch(row, 'ADA'), true);
  assert.equal(draftMatchesSearch(row, 'email'), true);
  assert.equal(draftMatchesSearch(row, 'draft-abc'), true);
  assert.equal(draftMatchesSearch(row, 'hotel'), false);
  assert.equal(draftMatchesSearch({ title: null, summary: null }, 'x'), false);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /draftMatchesSearch/);
  assert.match(src, /drafts-search/);
  assert.match(src, /Search title, customer or source/);
});
