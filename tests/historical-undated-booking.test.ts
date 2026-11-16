import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existingFixture } from './padova-fixture';
import { execute, economics } from '../src/lib/finance';
import { OWNER_PERMISSIONS, type Actor } from '../src/lib/permissions';
import { importReviewedFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';
import { calendarEntries } from '../src/lib/travel-presentation';
import { nextTravelDate, travelsBetween } from '../src/lib/travel-schedule';

test('evidence-gated undated hotel preserves null dates and allocates an existing receipt atomically', async () => {
  const { raw, db } = await existingFixture(undefined, undefined, false, true);
  try {
    const owner = randomUUID(),
      batch = randomUUID(),
      file = randomUUID(),
      evidence = randomUUID();
    await raw.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'undated@example.invalid',now())",
      [owner],
    );
    await raw.query(
      "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','Undated QA','undated@example.invalid',$2,1)",
      [owner, OWNER_PERMISSIONS],
    );
    await raw.query(
      'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
    );
    await raw.query(
      "INSERT INTO padova_staging.import_batches(id,label,extracted_at,source_root,limitations) VALUES($1,'synthetic undated',now(),'synthetic','No real data')",
      [batch],
    );
    await raw.query(
      "INSERT INTO padova_staging.evidence_files(id,batch_id,path,sha256,bytes,media_review_status) VALUES($1,$2,'synthetic.json',$3,10,'synthetic')",
      [file, batch, 'b'.repeat(64)],
    );
    await raw.query(
      "INSERT INTO padova_staging.evidence_records(id,file_id,record_index,raw,evidence_class) VALUES($1,$2,1,'{\"synthetic\":true}','synthetic-reviewed-plan')",
      [evidence, file],
    );
    const actor: Actor = {
      id: owner,
      name: 'Undated QA',
      role: 'OWNER',
      permissions: [...OWNER_PERMISSIONS],
    };
    const command = (kind: Parameters<typeof execute>[2]['kind'], data: unknown) =>
      execute(db, actor, { id: randomUUID(), kind, data });
    const customer = await command('party', {
      name: 'Synthetic hotel guest',
      kind: 'person',
      roles: ['customer'],
    });
    const payment = await command('payment', {
      direction: 'customer',
      party_id: customer.id,
      amount: 31900,
      date: '2026-10-30',
      method: 'Card',
    });
    const data = {
      historical_undated_booking: true,
      customer_id: customer.id,
      product: 'Hotel',
      channel: 'Hotel booking',
      summary: 'Synthetic undated stay',
      booked_on: '2026-10-30',
      travel_start: null,
      travel_end: null,
      sale: 31900,
      itinerary: { hotel_name: 'Synthetic hotel', sale_known: true, cost_status: 'Pending' },
    };
    await assert.rejects(command('booking', data), /reviewed source importer/);
    await assert.rejects(
      command('booking', { ...data, historical_undated_booking: undefined }),
      /Travel dates are required/,
    );
    const event = (
      role: string,
      kind: ImportEvent['kind'],
      values: Record<string, unknown>,
    ): ImportEvent => ({
      source_system: 'synthetic-undated',
      source_key: role,
      event_role: role,
      evidence_id: evidence,
      capture_batch_id: batch,
      source_locator: { synthetic: true },
      reviewer_decision: 'Known hotel charge, unknown stay dates; reuse actual receipt',
      kind,
      data: values,
    });
    const plan = [
      event('historical_undated_booking', 'booking', data),
      event('allocation', 'allocate', {
        booking_id: { $event: 'historical_undated_booking' },
        payment_id: payment.id,
        amount: 31900,
        date: '2026-10-30',
      }),
    ];
    await assert.rejects(importReviewedFinancialPlan(db, actor, plan), /not authorized/);
    await assert.rejects(
      importReviewedFinancialPlan(db, actor, [{ ...plan[0], event_role: 'ordinary' }]),
      /explicit reviewed source role/,
    );
    await raw.query(
      "UPDATE padova.settings SET historical_financial_posting_authorized=true,historical_approved_batch_id=$1,historical_cutover_review='Synthetic isolated undated hotel acceptance' WHERE id=true",
      [batch],
    );
    await raw.exec('SET ROLE padova_app_server');
    for (const invalid of [
      { travel_start: '2026-11-01' },
      { product: 'Flight' },
      { booked_on: '2099-01-01' },
      { itinerary: { ...data.itinerary, cost_status: 'No supplier cost' } },
    ]) {
      await assert.rejects(
        importReviewedFinancialPlan(db, actor, [{ ...plan[0], data: { ...data, ...invalid } }]),
      );
    }
    const failure = structuredClone(plan);
    failure[1].data.amount = 31901;
    await assert.rejects(importReviewedFinancialPlan(db, actor, failure));
    assert.equal(Number((await db.query('SELECT count(*) n FROM bookings')).rows[0].n), 0);
    assert.equal((await importReviewedFinancialPlan(db, actor, plan)).created, 2);
    const replay = await importReviewedFinancialPlan(db, actor, plan);
    assert.equal(replay.created, 0);
    assert.equal(replay.replayed, 2);
    const booking = (await db.query('SELECT * FROM bookings')).rows[0];
    assert.equal(booking.travel_start, null);
    assert.equal(booking.travel_end, null);
    assert.equal(booking.itinerary.travel_dates_unknown, true);
    assert.equal(booking.itinerary.cost_status, 'Pending');
    const value = await economics(db, booking.id);
    assert.equal(Number(value.sale), 31900);
    assert.equal(Number(value.customer_balance), 0);
    assert.equal(value.profit, null);
    assert.equal(Number((await db.query('SELECT count(*) n FROM payments')).rows[0].n), 1);
    assert.equal(
      Number((await db.query('SELECT count(*) n FROM funding_components')).rows[0].n),
      0,
    );
    assert.equal(
      Number(
        (await db.query('SELECT coalesce(sum(debit-credit),0) n FROM journal_lines')).rows[0].n,
      ),
      0,
    );
    const undated = { id: booking.id, product: 'Hotel', travel_start: null, travel_end: null };
    assert.deepEqual(calendarEntries([undated], [], 'All'), []);
    assert.equal(travelsBetween(undated, [], '2026-11-01', '2026-11-30'), false);
    assert.equal(nextTravelDate(undated, [], '2026-11-01', '2026-11-30'), undefined);
    const changed = structuredClone(plan);
    changed[0].data.sale = 32000;
    await assert.rejects(importReviewedFinancialPlan(db, actor, changed), /Idempotency/);
  } finally {
    await raw.close();
  }
});
