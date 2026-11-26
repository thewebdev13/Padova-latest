import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import { detail, snapshot } from '../src/lib/queries';
import { NOTE_SOFT_DELETED_SQL } from '../src/lib/note-soft-delete';

test('NOTE_SOFT_DELETED_SQL targets note_hide overlay', () => {
  assert.match(NOTE_SOFT_DELETED_SQL, /note_hide/);
  assert.match(NOTE_SOFT_DELETED_SQL, /note_restore/);
  assert.match(NOTE_SOFT_DELETED_SQL, /note_id/);
});

test('note_hide / note_restore soft-remove without erasing notes row', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'Note soft-delete customer',
      kind: 'person',
      roles: ['customer'],
    });
    const method = (await db.query("SELECT * FROM booking_source_methods WHERE name='GDS'"))
      .rows[0];
    const booking = await run('booking', {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'Note soft-delete flight',
      booked_on: '2026-11-20',
      travel_start: '2027-01-10',
      travel_end: '2027-01-10',
      sale: 10000,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Note soft-delete flight',
          travel_start: '2027-01-10',
          travel_end: '2027-01-10',
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        source_method_id: method.id,
        components: [{ type: 'Padova payment', cost: 8000, method: 'Cash', date: '2026-11-20' }],
      },
    });
    const note = await run('note', {
      record_type: 'booking',
      record_id: booking.id,
      body: 'Customer prefers aisle seats',
    });
    let d = await detail(db, testOwner, 'booking', booking.id);
    assert.equal(d.notes.length, 1);
    assert.equal(d.notes[0].body, 'Customer prefers aisle seats');
    assert.equal((d.notesHidden ?? []).length, 0);
    const snapBefore = await snapshot(db, testOwner);
    const rowBefore = snapBefore.bookings.find((b: any) => b.id === booking.id);
    assert.match(String(rowBefore?.search_notes || ''), /aisle/);

    const hidden = await run('note_hide', { note_id: note.id });
    assert.equal(hidden.hidden, true);
    d = await detail(db, testOwner, 'booking', booking.id);
    assert.equal(d.notes.length, 0);
    assert.equal(d.notesHidden.length, 1);
    assert.equal(d.notesHidden[0].id, note.id);
    const stillThere = (await db.query('SELECT body FROM notes WHERE id=$1', [note.id])).rows[0];
    assert.equal(stillThere.body, 'Customer prefers aisle seats');
    const snapHidden = await snapshot(db, testOwner);
    const rowHidden = snapHidden.bookings.find((b: any) => b.id === booking.id);
    assert.equal(String(rowHidden?.search_notes || '').includes('aisle'), false);

    await assert.rejects(run('note_hide', { note_id: note.id }), /already hidden/i);

    const restored = await run('note_restore', { note_id: note.id });
    assert.equal(restored.restored, true);
    d = await detail(db, testOwner, 'booking', booking.id);
    assert.equal(d.notes.length, 1);
    assert.equal((d.notesHidden ?? []).length, 0);
    await assert.rejects(run('note_restore', { note_id: note.id }), /not hidden/i);
  } finally {
    await db.close();
  }
});
