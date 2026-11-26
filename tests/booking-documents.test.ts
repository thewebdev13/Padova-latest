import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database } from '../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../src/lib/users';
import { Actor } from '../src/lib/permissions';
import { execute } from '../src/lib/finance';
import {
  appendBookingDocument,
  bookingDocumentKindLabel,
  entryDocumentDraftStarted,
  hideBookingDocument,
  normalizeEntryDocumentDraft,
  visibleBookingDocuments,
} from '../src/lib/booking-documents';

test('entry document draft normalizes blank vs required label', () => {
  assert.equal(normalizeEntryDocumentDraft({}), null);
  assert.equal(normalizeEntryDocumentDraft({ label: '  ', url: '' }), null);
  assert.equal(entryDocumentDraftStarted({ document_url: 'https://x.test' }), true);
  assert.equal(entryDocumentDraftStarted({}), false);
  assert.throws(() => normalizeEntryDocumentDraft({ url: 'https://x.test/a.pdf' }), /label/i);
  const draft = normalizeEntryDocumentDraft({
    label: 'Itinerary PDF',
    kind: 'pdf',
    url: 'https://example.test/itin.pdf',
    note: 'From email',
    added_on: '2026-11-26',
  });
  assert.deepEqual(draft, {
    label: 'Itinerary PDF',
    kind: 'pdf',
    url: 'https://example.test/itin.pdf',
    note: 'From email',
    added_on: '2026-11-26',
  });
  const op = appendBookingDocument({ version: 1, sale_known: true }, {
    id: '22222222-2222-2222-2222-222222222222',
    ...draft!,
  });
  assert.equal(visibleBookingDocuments(op).length, 1);
});

test('document helpers append and soft-hide without inventing files', () => {
  const op = appendBookingDocument(
    { version: 1, sale_known: true },
    {
      id: '11111111-1111-1111-1111-111111111111',
      label: 'United eTicket',
      kind: 'pdf',
      url: 'https://example.test/ticket.pdf',
      added_on: '2026-11-26',
    },
  );
  assert.equal(visibleBookingDocuments(op).length, 1);
  assert.equal(bookingDocumentKindLabel('pdf'), 'PDF');
  const hidden = hideBookingDocument(op, '11111111-1111-1111-1111-111111111111', {
    hidden_at: '2026-11-26T12:00:00.000Z',
    reason: 'Wrong file',
  });
  assert.equal(visibleBookingDocuments(hidden).length, 0);
  assert.throws(() =>
    hideBookingDocument(hidden, '11111111-1111-1111-1111-111111111111', {
      hidden_at: '2026-11-26T12:00:00.000Z',
      reason: 'again',
    }),
  );
});

let db: Database;
let owner: Actor;
const ownerPassword = 'Synthetic owner password for booking documents tests';
const date = '2026-11-26';

before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Docs Owner',
    email: 'booking-docs-owner@example.invalid',
    password: ownerPassword,
  });
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});

after(async () => {
  await db.close();
});

async function cmd(kind: string, data: Record<string, unknown>) {
  return execute(db, owner, { id: randomUUID(), kind: kind as any, data });
}

test('booking_document posts link on operational_entry; hide soft-removes', async () => {
  const customer = await cmd('party', {
    kind: 'person',
    name: 'Docs Customer',
    roles: ['customer', 'traveler'],
  });
  const booking = await cmd('booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'Docs booking',
    booked_on: date,
    travel_start: date,
    travel_end: date,
    sale: 10000,
  });
  const doc = await cmd('booking_document', {
    booking_id: booking.id,
    label: 'Round-trip itinerary',
    kind: 'itinerary',
    url: 'https://example.test/itin.pdf',
    note: 'From airline email',
    date,
  });
  assert.ok(doc.id);
  const row = (
    await db.query('SELECT itinerary FROM bookings WHERE id=$1', [booking.id])
  ).rows[0];
  const visible = visibleBookingDocuments(row.itinerary?.operational_entry);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].label, 'Round-trip itinerary');
  assert.equal(visible[0].kind, 'itinerary');
  await cmd('booking_document_hide', {
    booking_id: booking.id,
    document_id: doc.id,
    reason: 'Superseded by reissue',
  });
  const after = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [booking.id]))
    .rows[0];
  assert.equal(visibleBookingDocuments(after.itinerary?.operational_entry).length, 0);
});
