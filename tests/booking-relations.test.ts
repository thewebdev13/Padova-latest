import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOKING_RELATION_KINDS,
  buildBookingFamilyTree,
  isActiveRelation,
} from '../src/lib/booking-relations';

test('relation kinds cover Plan family-tree labels', () => {
  assert.ok(BOOKING_RELATION_KINDS.includes('Change / extension'));
  assert.ok(BOOKING_RELATION_KINDS.includes('Same trip'));
  assert.ok(BOOKING_RELATION_KINDS.includes('Voucher used on'));
});

test('voided relations are inactive', () => {
  assert.equal(
    isActiveRelation({
      id: '1',
      from_booking_id: 'a',
      to_booking_id: 'b',
      kind: 'Same trip',
      voided_at: null,
    }),
    true,
  );
  assert.equal(
    isActiveRelation({
      id: '2',
      from_booking_id: 'a',
      to_booking_id: 'b',
      kind: 'Same trip',
      voided_at: '2026-11-25T00:00:00Z',
    }),
    false,
  );
});

test('family tree BFS expands undirected links; money stays per booking', () => {
  const tree = buildBookingFamilyTree({
    root_id: 'a',
    relations: [
      {
        id: 'e1',
        from_booking_id: 'a',
        to_booking_id: 'b',
        kind: 'Change / extension',
      },
      {
        id: 'e2',
        from_booking_id: 'c',
        to_booking_id: 'b',
        kind: 'Same trip',
      },
      {
        id: 'e3',
        from_booking_id: 'd',
        to_booking_id: 'e',
        kind: 'Other',
      },
      {
        id: 'e4',
        from_booking_id: 'a',
        to_booking_id: 'b',
        kind: 'Other',
        voided_at: '2026-11-01T00:00:00Z',
      },
    ],
    bookings: [
      { id: 'a', code: 'P-A', sale: 10000, reservation_status: 'Booked' },
      { id: 'b', code: 'P-B', sale: 20000, reservation_status: 'Booked' },
      { id: 'c', code: 'P-C', sale: 5000, reservation_status: 'Cancelled' },
      { id: 'd', code: 'P-D', sale: 999 },
    ],
  });
  assert.equal(tree.nodes.length, 3);
  assert.deepEqual(
    tree.nodes.map((n) => n.id).sort(),
    ['a', 'b', 'c'],
  );
  assert.equal(tree.edges.length, 2);
  assert.equal(tree.combined_sale_cents, 35000);
  assert.equal(tree.combined_incomplete, false);
});

test('combined sale incomplete when any linked sale unknown (never invent $0)', () => {
  const tree = buildBookingFamilyTree({
    root_id: 'a',
    relations: [
      {
        id: 'e1',
        from_booking_id: 'a',
        to_booking_id: 'b',
        kind: 'Rebooking after cancel',
      },
    ],
    bookings: [
      { id: 'a', code: 'P-A', sale: 10000 },
      { id: 'b', code: 'P-B', sale: null },
    ],
  });
  assert.equal(tree.combined_sale_cents, null);
  assert.equal(tree.combined_incomplete, true);
  assert.equal(tree.nodes.find((n) => n.id === 'b')?.sale_cents, null);
});

test('combined cost sums when known; incomplete when any cost unknown (never invent $0)', () => {
  const ok = buildBookingFamilyTree({
    root_id: 'a',
    relations: [
      {
        id: 'e1',
        from_booking_id: 'a',
        to_booking_id: 'b',
        kind: 'Same trip',
      },
    ],
    bookings: [
      { id: 'a', code: 'P-A', sale: 10000, funding_cost: 7000 },
      { id: 'b', code: 'P-B', sale: 20000, funding_cost: 15000 },
    ],
  });
  assert.equal(ok.combined_cost_cents, 22000);
  assert.equal(ok.combined_cost_incomplete, false);
  assert.equal(ok.combined_sale_cents, 30000);

  const incomplete = buildBookingFamilyTree({
    root_id: 'a',
    relations: [
      {
        id: 'e1',
        from_booking_id: 'a',
        to_booking_id: 'b',
        kind: 'Same trip',
      },
    ],
    bookings: [
      { id: 'a', code: 'P-A', sale: 10000, funding_cost: 7000 },
      { id: 'b', code: 'P-B', sale: 20000, funding_cost: 15000, cost_incomplete: true },
    ],
  });
  assert.equal(incomplete.combined_cost_cents, null);
  assert.equal(incomplete.combined_cost_incomplete, true);
  assert.equal(incomplete.nodes.find((n) => n.id === 'b')?.funding_cost_cents, null);
});

test('Related bookings UI: short name + Copy link for peer', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /Related bookings[\s\S]*bookingShortName\(peer\)[\s\S]*calendarBookingSharePath\(peerId\)[\s\S]*Copy link/,
  );
});
