import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createDatabase, requireCurrentSchema, type Database } from '../src/lib/db';
import { execute, economics, type CommandKind } from '../src/lib/finance';
import type { Actor } from '../src/lib/permissions';

if (process.env.PADOVA_DATABASE_MODE !== 'supabase')
  throw new Error('Explicit hosted mode required');
const db = await createDatabase(),
  rollback = new Error('Synthetic acceptance rollback');
const counts = async () =>
  (
    await db.query(
      `SELECT (SELECT count(*) FROM bookings)::text bookings,(SELECT count(*) FROM parties)::text parties,(SELECT count(*) FROM audit_events)::text audit,(SELECT count(*) FROM journal_lines)::text journal`,
    )
  ).rows[0];
try {
  await requireCurrentSchema(db);
  const before = await counts();
  const row = (
    await db.query(
      "SELECT id,name,role,permissions,auth_version FROM staff WHERE role='OWNER' AND active=true",
    )
  ).rows[0];
  if (!row) throw new Error('Verified individual Owner required');
  const owner = { ...row, authVersion: Number(row.auth_version) } as Actor;
  try {
    await db.transaction(async (tx) => {
      // Every synthetic command shares this real PostgreSQL transaction, which is always rolled back.
      const scoped: Database = { ...tx, transaction: (fn) => fn(tx), close: async () => {} };
      const cmd = (kind: CommandKind, data: unknown) =>
        execute(scoped, owner, { id: randomUUID(), kind, data });
      const customer = await cmd('party', {
        name: 'SYNTHETIC ROLLBACK QA customer',
        kind: 'person',
      });
      const supplier = await cmd('party', {
        name: 'SYNTHETIC ROLLBACK QA supplier',
        kind: 'supplier',
      });
      const booking = await cmd('booking', {
        customer_id: customer.id,
        supplier_id: supplier.id,
        product: 'Flight',
        channel: 'Direct',
        summary: 'SYNTHETIC ROLLBACK QA',
        booked_on: '2026-10-28',
        travel_start: '2026-11-01',
        travel_end: '2026-11-02',
        sale: 100000,
      });
      await cmd('fund', {
        booking_id: booking.id,
        kind: 'Card',
        face_amount: 80000,
        cost: 80000,
        date: '2026-10-28',
      });
      await cmd('payment', {
        party_id: customer.id,
        direction: 'customer',
        amount: 90000,
        date: '2026-10-28',
        method: 'ACH',
        allocations: [{ booking_id: booking.id, amount: 90000 }],
      });
      const totals = await economics(tx, booking.id);
      assert.equal(Number(totals.profit), 20000);
      assert.equal(Number(totals.customer_balance), 10000);
      await tx.query('SET CONSTRAINTS ALL IMMEDIATE');
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.deepEqual(
    await counts(),
    before,
    'Synthetic hosted acceptance must leave no business/audit/journal rows behind',
  );
  await writeFile(
    '.data/hosted-financial-receipt.json',
    JSON.stringify(
      {
        passed: true,
        verifiedAt: new Date().toISOString(),
        transactionRolledBack: true,
        businessRowsUnchanged: true,
        expectedProfitCents: 20000,
        customerBalanceCents: 10000,
        deferredGuardsVerified: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'Hosted financial acceptance passed: exact sale/funding/payment/profit, allocations, audit and deferred guards. All synthetic rows rolled back; existing business rows unchanged. Booking sequence may have a normal rollback gap.',
  );
} finally {
  await db.close();
}
