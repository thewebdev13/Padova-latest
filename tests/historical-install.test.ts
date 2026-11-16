import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existingFixture } from './padova-fixture';

test('historical preparation migration is additive, immutable, private, read-only to runtime and cannot authorize financial posting', async () => {
  const { raw, db } = await existingFixture(undefined, undefined, false, true);
  try {
    await raw.exec('CREATE ROLE padova_backup NOLOGIN BYPASSRLS');
    await raw.exec(
      await readFile(
        'supabase/migrations/20261029134634_padova_historical_booking_preparations.sql',
        'utf8',
      ),
    );
    const id = randomUUID();
    await raw.query(
      "INSERT INTO padova.historical_booking_preparations(id,facts,manifest_sha256) VALUES($1,'{}',$2)",
      [id, 'a'.repeat(64)],
    );
    await raw.query(
      "INSERT INTO padova.historical_source_preparations(id,source_key,fingerprint,status,target_id,summary,facts,source_payload_gzip,source_payload_sha256,rationale,financial_review) VALUES($1,'source-row',$2,'Prepared booking',$3,'{}','{}',$4,$2,'Exact source facts only',true)",
      [randomUUID(), 'b'.repeat(64), id, gzipSync('{}')],
    );
    assert.equal(
      Number(
        (await db.query('SELECT count(*) count FROM padova.historical_booking_preparations'))
          .rows[0].count,
      ),
      1,
    );
    await raw.exec('SET ROLE padova_app_server');
    await assert.rejects(
      db.query("UPDATE padova.historical_booking_preparations SET facts='{}'"),
      /permission denied/,
    );
    await raw.exec('RESET ROLE');
    await assert.rejects(
      raw.query("UPDATE padova.historical_booking_preparations SET facts='{}'"),
      /immutable|append|mutation|delete|history|correction/i,
    );
    await assert.rejects(
      raw.query(
        "INSERT INTO padova.historical_booking_preparations(id,facts,manifest_sha256,financial_postings_authorized) VALUES($1,'{}',$2,true)",
        [randomUUID(), 'c'.repeat(64)],
      ),
      /check constraint/,
    );
    const rights = (
      await raw.query(
        "SELECT has_table_privilege('anon','padova.historical_source_preparations','SELECT') anon,has_table_privilege('authenticated','padova.historical_source_preparations','SELECT') browser,has_table_privilege('padova_app_server','padova.historical_source_preparations','INSERT') write,has_table_privilege('padova_backup','padova.historical_source_preparations','SELECT') backup",
      )
    ).rows[0];
    assert.deepEqual(rights, { anon: false, browser: false, write: false, backup: true });
    assert.equal(Number((await db.query('SELECT count(*) count FROM bookings')).rows[0].count), 0);
    assert.equal(
      Number((await db.query('SELECT count(*) count FROM journal_lines')).rows[0].count),
      0,
    );
  } finally {
    await raw.close();
  }
});
