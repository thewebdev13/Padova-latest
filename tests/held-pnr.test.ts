import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingTicketingDeadline,
  buildHeldPnrReminders,
  heldDeadlineUrgency,
  shouldActivateHeld,
} from '../src/lib/held-pnr';

test('held deadline urgency bands', () => {
  assert.equal(heldDeadlineUrgency('2026-11-20', '2026-11-25'), 'overdue');
  assert.equal(heldDeadlineUrgency('2026-11-25', '2026-11-25'), 'due_today');
  assert.equal(heldDeadlineUrgency('2026-11-27', '2026-11-25'), 'due_soon');
  assert.equal(heldDeadlineUrgency('2026-12-10', '2026-11-25'), 'ok');
  assert.equal(heldDeadlineUrgency(null, '2026-11-25'), 'none');
});

test('activate Held only when paid and Ticketed', () => {
  assert.equal(
    shouldActivateHeld({
      reservation_status: 'Held',
      confirmation_status: 'Ticketed',
      sale: 10000,
      paid: 10000,
    }),
    true,
  );
  assert.equal(
    shouldActivateHeld({
      reservation_status: 'Held',
      confirmation_status: 'Pending',
      sale: 10000,
      paid: 10000,
    }),
    false,
  );
  assert.equal(
    shouldActivateHeld({
      reservation_status: 'Held',
      confirmation_status: 'Ticketed',
      sale: null,
      paid: 10000,
    }),
    false,
  );
  assert.equal(
    shouldActivateHeld({
      reservation_status: 'Booked',
      confirmation_status: 'Ticketed',
      sale: 10000,
      paid: 10000,
    }),
    false,
  );
});

test('reminders for due/overdue Held PNRs; missing deadline ignored by urgency helper', () => {
  const reminders = buildHeldPnrReminders(
    [
      {
        id: '1',
        code: 'P-1',
        reservation_status: 'Held',
        itinerary: { ticketing_deadline: '2026-11-20' },
      },
      {
        id: '2',
        code: 'P-2',
        reservation_status: 'Held',
        itinerary: { ticketing_deadline: '2026-12-31' },
      },
      { id: '3', code: 'P-3', reservation_status: 'Booked', itinerary: { ticketing_deadline: '2026-11-20' } },
    ],
    '2026-11-25',
  );
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].urgency, 'overdue');
  assert.equal(
    bookingTicketingDeadline({
      itinerary: { operational_entry: { ticketing_deadline: '2026-11-30' } },
    }),
    '2026-11-30',
  );
});
