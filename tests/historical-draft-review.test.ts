import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execute } from '../src/lib/finance';
import { detail } from '../src/lib/queries';
import { historicalDraftFacts } from '../src/lib/historical-draft-review';
import { financialDatabase, financialEmployee, testOwner } from './helpers';

test('historical edits append facts, preserve original and unknowns, reject stale writes and do not post money', async () => {
  const db = await financialDatabase();
  try {
    const draft = await execute(db, testOwner, {
      id: randomUUID(),
      kind: 'booking_draft',
      data: {
        title: 'Synthetic held voucher sale',
        entry: {
          summary: 'Voucher ending123456 sold to Synthetic Buyer',
          itinerary: {
            historical_reconciliation_status: 'Held',
            notes: 'Original preserved evidence',
          },
        },
      },
    });
    const before = await detail(db, testOwner, 'draft', draft.id);
    assert.equal(before.review.values.cost_cents, null);
    const facts = {
      summary: 'Voucher ending123456 sold to Synthetic Buyer',
      booked_on: '2026-11-03',
      date_certainty: 'Approximate',
      sale_cents: 12345,
      cost_cents: null,
      notes: 'Customer paid by card.',
    };
    const correction = {
      id: randomUUID(),
      kind: 'review_resolution' as const,
      data: {
        source_key: `historical-draft:${draft.id}`,
        source_locator: {},
        issue_type: 'Historical record correction',
        proposed_mapping: {
          format: 'historical-draft-facts-v1',
          fingerprint: before.review.fingerprint,
          facts,
        },
        status: 'Proposed',
        decision: 'Synthetic factual correction',
      },
    };
    await execute(db, testOwner, correction);
    await execute(db, testOwner, correction);
    const after = await detail(db, testOwner, 'draft', draft.id);
    assert.deepEqual(after.entry, before.entry);
    assert.deepEqual(after.review.values, facts);
    assert.equal(after.review.events.length, 1);
    assert.notEqual(after.review.fingerprint, before.review.fingerprint);
    await assert.rejects(execute(db, testOwner, { ...correction, id: randomUUID() }), /changed/);
    const worker = await financialEmployee(db);
    await assert.rejects(detail(db, worker, 'draft', draft.id));
    await assert.rejects(
      execute(
        db,
        { ...worker, permissions: [...worker.permissions, 'manage_settings'] },
        {
          ...correction,
          id: randomUUID(),
        },
      ),
    );
    for (const table of ['payments', 'asset_sales', 'journal_lines', 'bookings'])
      assert.equal(Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n), 0);
  } finally {
    await db.close();
  }
});

test('historical factual amounts preserve explicit zero and reject fractional cents or invented dates', () => {
  const facts = {
    summary: 'Synthetic',
    booked_on: null,
    date_certainty: 'Unknown',
    sale_cents: null,
    cost_cents: 0,
    notes: '',
  };
  assert.equal(historicalDraftFacts.parse(facts).cost_cents, 0);
  assert.equal(historicalDraftFacts.parse(facts).sale_cents, null);
  assert.throws(() => historicalDraftFacts.parse({ ...facts, sale_cents: 123.5 }));
  assert.throws(() => historicalDraftFacts.parse({ ...facts, date_certainty: 'Confirmed' }));
  assert.throws(() =>
    historicalDraftFacts.parse({ ...facts, booked_on: '2026-02-30', date_certainty: 'Confirmed' }),
  );
});
