import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { recoveryTableInventory, recoveryCompactInventory } from '../src/lib/recovery-inventory';

test('compact fingerprints match independent row hashes, preserve duplicates and detect corrections', async () => {
  const db = new PGlite();
  const reader = { query: async (sql: string) => db.query<Record<string, unknown>>(sql) };
  const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
  try {
    await db.exec(`CREATE TABLE source_rows (n integer, value jsonb);
      INSERT INTO source_rows SELECT i%19, jsonb_build_object('text', 'עברית é 😀 ' || repeat('x',1000))
      FROM generate_series(1,2503) i;`);
    const rows = (await reader.query('SELECT to_jsonb(t)::text AS value FROM source_rows t')).rows;
    const actual = await recoveryCompactInventory(reader, 'public', 'source_rows');
    assert.equal(actual.count, 2503);
    assert.equal(
      actual.fingerprint,
      sha(
        rows
          .map((r) => sha(String(r.value)))
          .sort()
          .join(''),
      ),
    );
    await db.exec('CREATE TABLE reordered AS SELECT * FROM source_rows ORDER BY n DESC');
    assert.deepEqual(await recoveryCompactInventory(reader, 'public', 'reordered'), actual);
    await db.exec(
      "UPDATE reordered SET value='null'::jsonb WHERE ctid=(SELECT ctid FROM reordered LIMIT 1)",
    );
    const changed = await recoveryCompactInventory(reader, 'public', 'reordered');
    assert.equal(changed.count, actual.count);
    assert.notEqual(changed.fingerprint, actual.fingerprint);
    await db.exec('CREATE TABLE empty_compact(n integer)');
    assert.equal(
      (await recoveryCompactInventory(reader, 'public', 'empty_compact')).fingerprint,
      sha(''),
    );
  } finally {
    await db.close();
  }
});

test('streamed inventory exactly matches legacy hashes across pages, duplicate and Unicode rows', async () => {
  const db = new PGlite();
  const reader = { query: async (sql: string) => db.query<Record<string, unknown>>(sql) };
  try {
    await db.exec(`CREATE SCHEMA "quoted schema";
      CREATE TABLE "quoted schema"."quoted""table" (n integer, value jsonb);
      INSERT INTO "quoted schema"."quoted""table"
      SELECT i % 19, jsonb_build_object('text', 'עברית é 😀 ' || (i % 5), 'null', null)
      FROM generate_series(1, 2503) i;`);
    await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const expected = (
      await reader.query(`SELECT count(*)::integer count,
      md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash,
      md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text COLLATE "C"),'')) canonical_hash
      FROM "quoted schema"."quoted""table" t`)
    ).rows[0];
    assert.deepEqual(
      await recoveryTableInventory(reader, 'quoted schema', 'quoted"table'),
      expected,
    );
    await db.exec('ROLLBACK');
    await db.exec('CREATE TABLE empty_inventory(id integer)');
    await db.exec('BEGIN READ ONLY');
    assert.deepEqual(await recoveryTableInventory(reader, 'public', 'empty_inventory'), {
      count: 0,
      hash: 'd41d8cd98f00b204e9800998ecf8427e',
      canonical_hash: 'd41d8cd98f00b204e9800998ecf8427e',
    });
    await db.exec('ROLLBACK');
  } finally {
    await db.close();
  }
});

test('inventory rejects malformed rows and closes the cursor without returning a false hash', async () => {
  const statements: string[] = [];
  const reader = {
    async query(sql: string) {
      statements.push(sql);
      return { rows: sql.startsWith('FETCH') ? [{ row_text: null }] : [] };
    },
  };
  await assert.rejects(recoveryTableInventory(reader, 'public', 'example'), /Invalid recovery/);
  assert.equal(statements.at(-1), 'CLOSE recovery_inventory_rows');
});
