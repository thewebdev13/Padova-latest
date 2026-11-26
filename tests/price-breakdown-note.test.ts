import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner } from './helpers';
import { execute } from '../src/lib/finance';
import { operationalEntry } from '../src/lib/booking-entry';
import {
  priceBreakdownNote,
  priceBreakdownNoteVisible,
} from '../src/lib/price-breakdown-note';

test('blank price breakdown stays hidden — never invents a split', () => {
  assert.equal(priceBreakdownNote(''), null);
  assert.equal(priceBreakdownNote('   '), null);
  assert.equal(priceBreakdownNote(null), null);
  assert.equal(priceBreakdownNoteVisible(undefined), false);
});

test('optional note trims and stays informational only', () => {
  assert.equal(priceBreakdownNote('  A $400 · B $350  '), 'A $400 · B $350');
  assert.equal(priceBreakdownNoteVisible('A $400 · B $350'), true);
  const parsed = operationalEntry.parse({
    version: 1,
    sale_known: true,
    how_booked: 'Cash / GDS',
    price_breakdown_note: '  Adult $900 · Child $450  ',
    components: [],
  });
  assert.equal(parsed.price_breakdown_note, 'Adult $900 · Child $450');
});

test('booking persists optional price_breakdown_note without changing sale', async () => {
  const db = await financialDatabase();
  const run = (kind: any, data: any) => execute(db, testOwner, { id: randomUUID(), kind, data });
  try {
    const customer = await run('party', {
      name: 'Family trip customer',
      kind: 'person',
      roles: ['customer'],
    });
    const airline = await run('party', {
      name: 'Breakdown Air',
      kind: 'company',
      roles: ['airline'],
    });
    const b = await run('booking', {
      customer_id: customer.id,
      product: 'Flight',
      channel: 'GDS',
      summary: 'Family RT',
      booked_on: '2026-11-20',
      travel_start: '2026-12-10',
      travel_end: '2026-12-20',
      sale: 135000,
      travel_components_input: [
        {
          product: 'Flight',
          summary: 'Family RT',
          provider_id: airline.id,
          travel_start: '2026-12-10',
          travel_end: '2026-12-20',
        },
      ],
      operational: {
        version: 1,
        sale_known: true,
        how_booked: 'Cash / GDS',
        price_breakdown_note: 'Adult $900 · Child $450',
        components: [
          {
            type: 'Padova payment',
            cost: 110000,
            method: 'Cash',
            date: '2026-11-20',
          },
        ],
      },
    });
    assert.ok(b.id);
    const row = (await db.query('SELECT itinerary FROM bookings WHERE id=$1', [b.id])).rows[0];
    assert.equal(
      row.itinerary.operational_entry.price_breakdown_note,
      'Adult $900 · Child $450',
    );
    assert.equal(
      priceBreakdownNote(row.itinerary.operational_entry.price_breakdown_note),
      'Adult $900 · Child $450',
    );
    assert.equal(priceBreakdownNoteVisible(row.itinerary.operational_entry.price_breakdown_note), true);
    // Blank note stays omitted — sale total is unchanged by this field.
    assert.equal(priceBreakdownNoteVisible(''), false);
  } finally {
    await db.close();
  }
});
