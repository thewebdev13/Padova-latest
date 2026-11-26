import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute } from '../src/lib/finance';
import { detail } from '../src/lib/queries';
import { ageAtTravel, ticketingValues } from '../src/lib/traveler-ticketing';
import {
  bookingShortName,
  calendarBookingSharePath,
  calendarEntries,
  calendarEntryMatchesSearch,
  calendarEntryVisibleWithCancelled,
  calendarLanes,
  tripTitle,
} from '../src/lib/travel-presentation';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
test('ticketing patch reuses permanent identity, retains rich profile, detects stale changes, and replays once', async () => {
  const db = await financialDatabase();
  try {
    const run = (kind: any, data: any, id = randomUUID()) =>
      execute(db, testOwner, { id, kind, data });
    const person = await run('party', {
      name: 'Synthetic feedback three',
      kind: 'person',
      roles: ['traveler'],
    });
    const baseline = { dob: '', sex: '', nationality: '' };
    const payload = {
      person_id: person.id,
      ticketing_only: true,
      ...baseline,
      dob: '2018-11-10',
      sex: 'F',
      nationality: 'Philippines',
      expected: baseline,
    };
    const key = randomUUID();
    await run('traveler', payload, key);
    await run('traveler', payload, key);
    let stored = (await db.query('SELECT * FROM traveler_private WHERE person_id=$1', [person.id]))
      .rows[0];
    assert.equal(stored.legal_first, null, 'no invented legal names');
    assert.equal(ticketingValues(stored).nationality, 'Philippines');
    await run('traveler', {
      person_id: person.id,
      legal_first: 'Synthetic',
      last_name: 'Traveler',
      dob: stored.dob,
      ktn: 'SYNTHETIC',
      memberships: [{ program: 'United', number: 'SYNTHETIC' }],
      documents: [{ type: 'passport', number: 'SYNTHETIC', country: 'United States' }],
      preferences: { ...stored.preferences, seat: 'Window', redress: 'SYNTHETIC' },
    });
    const expected = ticketingValues(stored);
    await run('traveler', { ...payload, expected, nationality: 'United States' });
    await assert.rejects(
      run('traveler', { ...payload, expected, sex: 'M' }),
      /changed in another session/,
    );
    stored = (await db.query('SELECT * FROM traveler_private WHERE person_id=$1', [person.id]))
      .rows[0];
    assert.equal(stored.documents.length, 1);
    assert.equal(stored.memberships.length, 1);
    assert.equal(stored.ktn, 'SYNTHETIC');
    assert.equal(stored.preferences.seat, 'Window');
    assert.equal(stored.preferences.redress, 'SYNTHETIC');
    assert.equal(stored.legal_first, 'Synthetic');
    assert.equal(
      Number((await db.query('SELECT count(*) n FROM parties WHERE id=$1', [person.id])).rows[0].n),
      1,
    );
    const employee = await financialEmployee(db);
    await assert.rejects(
      execute(db, employee, {
        id: randomUUID(),
        kind: 'traveler',
        data: { ...payload, expected: ticketingValues(stored) },
      }),
      /Permission/,
    );
    assert.equal((await detail(db, employee, 'person', person.id)).privateData, null);
    assert.equal(Number((await db.query('SELECT count(*) n FROM journal_lines')).rows[0].n), 0);
  } finally {
    await db.close();
  }
});
test('age is calculated on travel date and Unknown without a valid chronology', () => {
  assert.equal(ageAtTravel('2018-11-10', '2026-11-09'), 7);
  assert.equal(ageAtTravel('2018-11-10', '2026-11-10'), 8);
  assert.equal(ageAtTravel('', '2026-11-10'), null);
  assert.equal(ageAtTravel('2027-01-01', '2026-11-10'), null);
});
test('calendar spans source components, keeps cancellations and never invents parent gap trips', () => {
  const bookings = [
    {
      id: 'b',
      product: 'Hotel',
      travel_start: '2026-11-01',
      travel_end: '2026-11-20',
      summary: 'Hotel',
      travelers: 'Synthetic',
    },
  ];
  const parts = [
    {
      id: 'h',
      booking_id: 'b',
      product: 'Hotel',
      travel_start: '2026-11-04',
      travel_end: '2026-11-07',
    },
    {
      id: 'c',
      booking_id: 'b',
      product: 'Car',
      travel_start: '2026-11-10',
      travel_end: '2026-11-12',
      status: 'Cancelled',
    },
  ];
  const entries = calendarEntries(bookings, parts, 'All');
  assert.equal(entries.length, 2);
  assert.equal(entries[1].cancelled, true);
  const week = [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07',
    '2026-11-08',
  ];
  const lanes = calendarLanes(entries, week);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].start, 2);
  assert.equal(lanes[0].end, 5);
  assert.equal(calendarEntries(bookings, parts, 'Car').length, 1);
  assert.equal(tripTitle({ summary: 'Hotel · Miami · 2026-11-04 – 2026-11-07' }), 'Hotel · Miami');
});

test('Plan one short booking name — product · place; blank route does not invent', () => {
  assert.equal(
    bookingShortName({ product: 'Flight', itinerary: { route: 'JFK–MIA' } }),
    'Flight · JFK–MIA',
  );
  assert.equal(
    bookingShortName({ product: 'Hotel', location: 'Miami Beach' }),
    'Hotel · Miami Beach',
  );
  assert.equal(
    bookingShortName({ product: 'Flight', summary: 'Flight · 2026-12-01' }),
    'Flight',
  );
  assert.equal(bookingShortName({}), 'Booking');
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(src, /Traveling today[\s\S]*bookingShortName\(tripView\(b\)\)/);
  assert.match(src, /Upcoming bookings[\s\S]*bookingShortName\(tripView\(b\)\)/);
  assert.match(src, /label: `\$\{b\.code\} · \$\{bookingShortName\(tripView\(b\)\)\}`/);
});

test('Calendar Copy link uses shareable booking path; blank id never invents', () => {
  assert.equal(calendarBookingSharePath(null), null);
  assert.equal(calendarBookingSharePath(''), null);
  assert.equal(calendarBookingSharePath('   '), null);
  assert.equal(calendarBookingSharePath('bk-1'), '/w/transactions#booking=bk-1');
  const cal = readFileSync(join(process.cwd(), 'src/components/travel-calendar.tsx'), 'utf8');
  assert.match(cal, /copyLink/);
  assert.match(cal, /onContextMenu/);
  assert.match(cal, /Right-click to copy shareable link/);
  const src = readFileSync(join(process.cwd(), 'src/app/workspace.tsx'), 'utf8');
  assert.match(
    src,
    /TravelCalendar[\s\S]*copyLink=\{async \(id\) => \{[\s\S]*calendarBookingSharePath/,
  );
});

test('Calendar search: booking # · customer · trip; blank query matches all ≠ invent', () => {
  const entry = {
    code: 'PDV-100',
    customer: 'Ada Lovelace',
    travelers: 'Ada · Bob',
    product: 'Flight',
    summary: 'JFK–TLV',
    booking_id: 'b-abc',
  };
  assert.equal(calendarEntryMatchesSearch(entry, ''), true);
  assert.equal(calendarEntryMatchesSearch(entry, null), true);
  assert.equal(calendarEntryMatchesSearch(entry, 'pdv-100'), true);
  assert.equal(calendarEntryMatchesSearch(entry, 'ADA'), true);
  assert.equal(calendarEntryMatchesSearch(entry, 'jfk'), true);
  assert.equal(calendarEntryMatchesSearch(entry, 'b-abc'), true);
  assert.equal(calendarEntryMatchesSearch(entry, 'hotel'), false);
  assert.equal(calendarEntryMatchesSearch({ code: null, customer: null }, 'x'), false);
  const cal = readFileSync(join(process.cwd(), 'src/components/travel-calendar.tsx'), 'utf8');
  assert.match(cal, /calendarEntryMatchesSearch/);
  assert.match(cal, /calendar-search/);
  assert.match(cal, /Search booking #, customer or trip/);
});

test('Calendar hide cancelled: default shows marked trips; toggle omits cancelled ≠ invent', () => {
  assert.equal(calendarEntryVisibleWithCancelled({ cancelled: true }, false), true);
  assert.equal(calendarEntryVisibleWithCancelled({ cancelled: false }, false), true);
  assert.equal(calendarEntryVisibleWithCancelled({ cancelled: true }, true), false);
  assert.equal(calendarEntryVisibleWithCancelled({ cancelled: false }, true), true);
  assert.equal(calendarEntryVisibleWithCancelled({}, true), true);
  const cal = readFileSync(join(process.cwd(), 'src/components/travel-calendar.tsx'), 'utf8');
  assert.match(cal, /calendarEntryVisibleWithCancelled/);
  assert.match(cal, /Hide cancelled/);
  assert.match(cal, /hideCancelled/);
});
