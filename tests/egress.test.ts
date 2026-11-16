import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialDatabase, testOwner, financialEmployee } from './helpers';
import { execute, economics } from '../src/lib/finance';
import { stateRevision } from '../src/lib/state-revision';
import { businessDate } from '../src/lib/business-date';
import { historicalPreparationIndex } from '../src/lib/historical-preparation-store';
import { snapshot, detail } from '../src/lib/queries';
import type { Database } from '../src/lib/db';

test('change checks are stable without writes, change after commands and preserve economics', async () => {
  const db = await financialDatabase();
  try {
    const before = await stateRevision(db, testOwner);
    assert.equal(await stateRevision(db, testOwner), before);
    const customer = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'party',
      data: {
        name: 'Synthetic bandwidth regression',
        kind: 'person',
        roles: ['customer'],
      },
    });
    const after = await stateRevision(db, testOwner);
    assert.notEqual(after, before);
    assert.equal(await stateRevision(db, testOwner), after);
    const booking = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'booking',
      data: {
        customer_id: customer.id,
        product: 'Flight',
        channel: 'Direct',
        summary: 'Synthetic trip',
        booked_on: '2026-11-05',
        travel_start: '2026-11-10',
        travel_end: '2026-11-12',
        sale: 10000,
        itinerary: {
          historical_sources: [
            { original_fields: { source: 'Synthetic preserved evidence', raw: 'x'.repeat(10000) } },
          ],
        },
      },
    });
    const row = (await db.query('SELECT * FROM booking_balances WHERE id=$1', [booking.id]))
      .rows[0];
    const original = structuredClone(row);
    const expected = await economics(db, booking.id);
    const actual = await economics(db, booking.id, { booking: row, today: await businessDate(db) });
    assert.deepEqual(actual, expected);
    assert.deepEqual(row, original, 'preloaded row must not be mutated');
    assert.equal(actual.supplier_balance, null, 'unknown cost must remain unknown');
    const listed = await snapshot(db, testOwner);
    assert.equal(
      listed.bookings.find((b: any) => b.id === booking.id)?.itinerary.historical_sources,
      undefined,
    );
    const opened = await detail(db, testOwner, 'booking', booking.id);
    assert.ok(JSON.stringify(opened).includes('Synthetic preserved evidence'));
    const worker = await financialEmployee(db);
    assert.notEqual(await stateRevision(db, worker), await stateRevision(db, testOwner));
    await assert.rejects(
      stateRevision(db, { ...testOwner, permissions: [], role: 'EMPLOYEE', id: 'unprivileged' }),
    );
  } finally {
    await db.close();
  }
});

test('historical list is bounded and filtered in SQL; workers perform no evidence reads', async () => {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const db = {
    storage: 'padova',
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('to_regclass')) return { rows: [{ name: 'present' }] };
      if (sql.includes('GROUP BY'))
        return { rows: [{ status: 'Prepared booking', count: 501, unresolved: 20 }] };
      return {
        rows: Array.from({ length: 101 }, (_, i) => ({
          id: String(i),
          status: 'Prepared booking',
          summary: {},
        })),
      };
    },
  } as Database;
  const result = await historicalPreparationIndex(testOwner, db, {
    search: "O'Brien_%",
    offset: 100,
  });
  assert.equal(result.rows.length, 100);
  assert.equal(result.hasMore, true);
  assert.equal(result.reconciliation.totalSourceRows, 501);
  assert.match(calls[2].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[2].values, ['Prepared booking', "o'brien_%", 101, 100]);
  assert.doesNotMatch(calls[2].sql, /source_payload_gzip|rationale/);
  calls.length = 0;
  assert.equal(await historicalPreparationIndex({ ...testOwner, role: 'EMPLOYEE' }, db), null);
  assert.equal(calls.length, 0);
});
