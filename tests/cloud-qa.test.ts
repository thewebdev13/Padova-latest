import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { cloudQASchema } from '../scripts/prepare-cloud-qa';
import { assertQAIsolation } from '../src/lib/qa';
import { PADOVA_QA_PROJECT, PADOVA_PROJECT } from '../src/lib/project';

test('hosted QA accepts only its pinned restricted connection and rejects production', () => {
  const env = {
    NODE_ENV: 'test' as const,
    PADOVA_QA: '1',
    PADOVA_DATABASE_MODE: 'supabase',
    PADOVA_QA_PROJECT_REF: PADOVA_QA_PROJECT.ref,
    SUPABASE_URL: PADOVA_QA_PROJECT.url,
    DATABASE_URL: `postgresql://padova_qa_runtime:fake@db.${PADOVA_QA_PROJECT.ref}.supabase.co/postgres?sslmode=verify-full`,
    VERCEL_PROJECT_ID: 'prj_sHhN3MbYAAsTIwm4jJZWTbvkYucA',
    VERCEL_PROJECT_PRODUCTION_URL: 'padova-qa-beta.vercel.app',
  };
  assert.doesNotThrow(() => assertQAIsolation(env));
  assert.throws(() => assertQAIsolation({ ...env, PADOVA_QA: '0' }));
  assert.throws(() => assertQAIsolation({ ...env, SUPABASE_URL: PADOVA_PROJECT.url }));
  assert.throws(() =>
    assertQAIsolation({
      ...env,
      DATABASE_URL: env.DATABASE_URL.replace(PADOVA_QA_PROJECT.ref, PADOVA_PROJECT.ref),
    }),
  );
  assert.throws(() =>
    assertQAIsolation({
      ...env,
      DATABASE_URL: env.DATABASE_URL.replace('padova_qa_runtime:', 'postgres:'),
    }),
  );
  assert.throws(() => assertQAIsolation({ ...env, PADOVA_EVIDENCE_ROOT: 'private' }));
});

test('empty hosted QA bootstrap reuses adapter, contains no business data and closes legacy RPCs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    // In-memory PGlite database is named template1; only replace this empty-target assertion in the test.
    const sql = (await cloudQASchema()).replace("current_database() <> 'postgres' OR ", '');
    await db.exec(sql);
    const marker = await db.query('SELECT * FROM padova.qa_environment');
    assert.equal((marker.rows[0] as any).project_ref, PADOVA_QA_PROJECT.ref);
    for (const table of ['bookings', 'parties', 'staff']) {
      const r = await db.query(`SELECT count(*)::int n FROM padova.${table}`);
      assert.equal((r.rows[0] as any).n, 0);
    }
    const r = await db.query(
      "SELECT has_function_privilege('authenticated','public.padova_command(text,jsonb,uuid)','EXECUTE') allowed",
    );
    assert.equal((r.rows[0] as any).allowed, false);
    await assert.rejects(() => db.exec(sql), /empty new database/);
  } finally {
    await db.close();
  }
});
