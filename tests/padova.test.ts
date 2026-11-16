import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createDatabase, type Database } from '../src/lib/db';
import {
  padovaStorage,
  decimalToCents,
  centsToDecimal,
  padovaSQL,
} from '../src/lib/padova-storage';
import { execute, economics } from '../src/lib/finance';
import { OWNER_PERMISSIONS } from '../src/lib/permissions';

import { existingFixture } from './padova-fixture';

test('exact decimal boundary and SQL lexer preserve values and comments', () => {
  assert.equal(decimalToCents('123.45'), 12345);
  assert.equal(centsToDecimal(-5), '-0.05');
  assert.throws(() => decimalToCents('1.001'));
  assert.throws(() => decimalToCents('900000000000.01'));
  assert.equal(
    padovaSQL("SELECT * FROM bookings WHERE summary='bookings' -- payments"),
    "SELECT * FROM padova.app_bookings WHERE summary='bookings' -- payments",
  );
});
test('existing-schema adapter uses canonical parties/bookings and exact decimal charges', async () => {
  const { raw, db } = await existingFixture();
  try {
    const id = randomUUID();
    await raw.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'owner@example.invalid',now())",
      [id],
    );
    await raw.query(
      "INSERT INTO padova.staff(user_id,role,app_name,app_email,app_permissions,app_auth_version) VALUES($1,'owner','Synthetic Owner','owner@example.invalid',$2,1)",
      [id, OWNER_PERMISSIONS],
    );
    await raw.query(
      'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
    );
    const actor = {
      id,
      name: 'Synthetic Owner',
      role: 'OWNER' as const,
      permissions: OWNER_PERMISSIONS,
      authVersion: 1,
    };
    const cmd = (kind: any, data: any) => execute(db, actor, { id: randomUUID(), kind, data });
    const p = await cmd('party', {
      name: 'Adapter customer',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    });
    const b = await cmd('booking', {
      customer_id: p.id,
      product: 'Flight',
      channel: 'Direct',
      summary: 'Adapter journey',
      booked_on: '2026-10-01',
      travel_start: '2026-11-01',
      travel_end: '2026-11-02',
      sale: 12345,
    });
    assert.equal(
      (await raw.query('SELECT display_name FROM padova.parties WHERE id=$1', [p.id])).rows[0]
        .display_name,
      'Adapter customer',
    );
    assert.equal(
      String(
        (await raw.query('SELECT amount FROM padova.charges WHERE booking_id=$1', [b.id])).rows[0]
          .amount,
      ),
      '123.45',
    );
    assert.ok(
      (await raw.query('SELECT actor FROM padova.audit_events')).rows.every((r) => r.actor === id),
    );
    const restored = await createDatabase(true, await db.dump!());
    const restoredAdapter = padovaStorage(restored);
    try {
      const restoredEconomics = await economics(restoredAdapter, b.id);
      assert.equal(
        restoredEconomics.profit,
        null,
        'restoring a sale without cost does not turn unknown cost into zero',
      );
      assert.equal(restoredEconomics.cost_incomplete, true);
      assert.equal(
        Number(
          (await restoredAdapter.query('SELECT sum(debit-credit) AS total FROM journal_lines'))
            .rows[0].total,
        ),
        0,
      );
    } finally {
      await restoredAdapter.close();
    }
  } finally {
    await db.close();
  }
});

test('unadopted existing bookings retain unknown economics and reject new-engine writes', async () => {
  const owner = randomUUID(),
    customer = randomUUID(),
    booking = randomUUID();
  const { raw, db } = await existingFixture(undefined, async (raw) => {
    await raw.query("INSERT INTO auth.users(id,email) VALUES($1,'legacy-owner@example.invalid')", [
      owner,
    ]);
    await raw.query("INSERT INTO padova.staff(user_id,role) VALUES($1,'owner')", [owner]);
    await raw.query(
      "INSERT INTO padova.parties(id,display_name,kind) VALUES($1,'Preserved synthetic customer','person')",
      [customer],
    );
    await raw.query(
      "INSERT INTO padova.bookings(id,customer_id,kind,status,booked_date,summary,verification,financial_complete) VALUES($1,$2,'standard','Booked','2026-10-01','Preserved original booking','unresolved',false)",
      [booking, customer],
    );
    await raw.query(
      'INSERT INTO padova.settings(id,operational_entry_enabled,backup_verified_at) VALUES(true,true,now())',
    );
  });
  try {
    const values = await economics(db, booking);
    assert.equal(values.profit, null);
    assert.equal(values.sale, null);
    assert.equal(values.customer_balance, null);
    await assert.rejects(
      execute(
        db,
        { id: owner, name: 'Legacy Owner', role: 'OWNER', permissions: OWNER_PERMISSIONS },
        {
          id: randomUUID(),
          kind: 'charge',
          data: { booking_id: booking, amount: 1000, kind: 'sale', date: '2026-10-28' },
        },
      ),
      /explicit compatibility review/,
    );
    await assert.rejects(
      db.query('UPDATE bookings SET summary=$2 WHERE id=$1', [booking, 'Overwrite']),
      /explicit compatibility review/,
    );
    assert.equal(
      (await raw.query('SELECT summary FROM padova.bookings WHERE id=$1', [booking])).rows[0]
        .summary,
      'Preserved original booking',
    );
    assert.equal(
      (await raw.query('SELECT count(*)::integer AS n FROM padova.charges')).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test('extensions preserve 37,071 staged records, 947 reviews/audit events and the original write gate', async () => {
  let before: any;
  const digest = `SELECT jsonb_build_object(
  'evidence',(SELECT md5(string_agg(id::text||raw::text,',' ORDER BY id)) FROM padova_staging.evidence_records),
  'reviews',(SELECT md5(string_agg(to_jsonb(r)::text,',' ORDER BY id)) FROM padova.review_cases r),
  'audit',(SELECT md5(string_agg((to_jsonb(a)-'app_command_id')::text,',' ORDER BY id)) FROM padova.audit_events a),
  'mappings',(SELECT md5(string_agg((to_jsonb(m)-'app_financial_event_key'-'app_command_id'-'app_source_fingerprint')::text,',' ORDER BY id)) FROM padova_staging.migration_mappings m),
  'settings',(SELECT to_jsonb(s)-'historical_financial_posting_authorized'-'historical_approved_batch_id'-'historical_cutover_review' FROM padova.settings s WHERE id=true)) AS digest`;
  const { raw, db } = await existingFixture(
    undefined,
    async (raw) => {
      await raw.exec(`INSERT INTO padova.settings(id) VALUES(true);
   INSERT INTO padova_staging.import_batches(label,extracted_at,source_root,status,limitations) VALUES('synthetic-preservation',now(),'synthetic','staged_unverified','No real data');
   INSERT INTO padova_staging.evidence_files(batch_id,path,sha256,bytes,media_review_status) SELECT id,'synthetic.json',repeat('0',64),0,'synthetic' FROM padova_staging.import_batches;
   INSERT INTO padova_staging.evidence_records(file_id,record_index,raw,evidence_class) SELECT f.id,n,jsonb_build_object('synthetic',n),'unresolved' FROM padova_staging.evidence_files f CROSS JOIN generate_series(1,37071)n;
   INSERT INTO padova.review_cases(category,title,evidence) SELECT 'migration','Synthetic review '||n,jsonb_build_object('synthetic',n) FROM generate_series(1,947)n;`);
      before = (await raw.query(digest)).rows[0].digest;
    },
    false,
    true,
  );
  try {
    assert.deepEqual((await raw.query(digest)).rows[0].digest, before);
    const historicalGate = (
      await raw.query(
        'SELECT historical_financial_posting_authorized,historical_approved_batch_id,historical_cutover_review FROM padova.settings WHERE id=true',
      )
    ).rows[0];
    assert.deepEqual(historicalGate, {
      historical_financial_posting_authorized: false,
      historical_approved_batch_id: null,
      historical_cutover_review: null,
    });
    const counts = (
      await raw.query(
        'SELECT (SELECT count(*)::integer FROM padova_staging.evidence_records) AS evidence,(SELECT count(*)::integer FROM padova.review_cases) AS reviews,(SELECT count(*)::integer FROM padova.audit_events) AS audit',
      )
    ).rows[0];
    assert.deepEqual(counts, { evidence: 37071, reviews: 947, audit: 947 });
    assert.equal(
      (await raw.query("SELECT to_regnamespace('padova_v1') AS schema")).rows[0].schema,
      null,
    );
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const exposed = await raw.query(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='padova' AND c.relname=ANY($2::text[]) AND has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE')",
        [
          role,
          [
            'programs',
            'instruments',
            'program_accounts',
            'travel_components',
            'inventory_profiles',
            'fulfillment_details',
            'funding_asset_uses',
            'expected_events',
            'expected_event_updates',
          ],
        ],
      );
      assert.equal(exposed.rows.length, 0);
    }
    await raw.exec('SET ROLE padova_app_server');
    await assert.rejects(
      raw.query('UPDATE padova.settings SET operational_entry_enabled=true'),
      /permission denied/,
    );
    await assert.rejects(
      raw.query("UPDATE padova.review_cases SET status='resolved'"),
      /permission denied/,
    );
    await assert.rejects(
      raw.query('SELECT * FROM padova_staging.evidence_records LIMIT 1'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test('Employee JWT database role cannot call old RPCs or select adapter financial views', async () => {
  const { raw, db } = await existingFixture();
  try {
    const functions = (
      await raw.query(
        `SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','padova') AND (p.proname LIKE 'padova_%' OR p.proname IN ('command','read_data','booking_detail','manage_staff'))`,
      )
    ).rows;
    assert.equal(functions.length, 12);
    assert.ok(functions.every((x) => x.allowed === false));
    await raw.exec('SET ROLE authenticated');
    await assert.rejects(raw.query("SELECT public.padova_read('reports')"), /permission denied/);
    await assert.rejects(raw.query("SELECT padova.read_data('reports')"), /permission denied/);
    await assert.rejects(
      raw.query('SELECT * FROM padova.app_booking_balances'),
      /permission denied/,
    );
    await assert.rejects(raw.query('SELECT * FROM padova.app_staff'), /permission denied/);
  } finally {
    await db.close();
  }
});
test('the exact review package installs atomically in the existing structural fixture', async () => {
  const sql = await readFile('db/padova/review-install.sql', 'utf8');
  assert.ok(
    !/^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+(?:TABLE|SCHEMA)|CREATE\s+SCHEMA)\b/im.test(sql),
  );
  const { raw, db } = await existingFixture(
    undefined,
    async (raw) => {
      await raw.query('INSERT INTO padova.settings(id) VALUES(true)');
    },
    true,
  );
  try {
    assert.equal(
      (await raw.query('SELECT version FROM padova.app_schema_versions')).rows[0].version,
      '20261028_existing_padova_adapter',
    );
    await assert.rejects(raw.exec(sql), /already exist/);
  } finally {
    await db.close();
  }
});
