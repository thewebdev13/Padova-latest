import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute } from '../src/lib/finance';
import { detail } from '../src/lib/queries';
import { ageAtTravel, ticketingValues } from '../src/lib/traveler-ticketing';
import { calendarEntries, calendarLanes, tripTitle } from '../src/lib/travel-presentation';
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
