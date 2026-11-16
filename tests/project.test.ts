import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDatabaseTarget, configuredDatabaseURL, PADOVA_PROJECT } from '../src/lib/project';
import { createDatabase, migrate, requireCurrentSchema } from '../src/lib/db';

test('cloud configuration accepts only the chosen US project with verified TLS', () => {
  const check = (value: string) => validateDatabaseTarget({ DATABASE_URL: value });
  const direct = `postgresql://postgres:placeholder@db.${PADOVA_PROJECT.ref}.supabase.co:5432/postgres?sslmode=verify-full`;
  const pooled = `postgresql://postgres.${PADOVA_PROJECT.ref}:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  assert.doesNotThrow(() => check(direct));
  assert.doesNotThrow(() => check(pooled));
  assert.throws(() => check(direct.replace(PADOVA_PROJECT.ref, 'qqnybbtruvkrstziswsi')));
  assert.throws(() => check(pooled.replace(PADOVA_PROJECT.ref, 'qqnybbtruvkrstziswsi')));
  assert.throws(() => check(direct.replace('verify-full', 'disable')));
  assert.throws(() => check(direct + '&options=-c%20search_path=padova'));
  assert.throws(() => check(pooled.replace(':5432/', ':6543/')));
  const secure = configuredDatabaseURL({
    DATABASE_URL: direct.split('?')[0],
    PADOVA_DB_CA_FILE: 'C:/private/project-ca.crt',
  })!;
  assert.equal(new URL(secure).searchParams.get('sslmode'), 'verify-full');
  assert.equal(new URL(secure).searchParams.get('sslrootcert'), 'C:/private/project-ca.crt');
  assert.throws(() => check('not-a-connection-string'));
});

test('explicit cloud mode cannot silently fall back to the local database', () => {
  assert.throws(() => validateDatabaseTarget({ PADOVA_DATABASE_MODE: 'supabase' }));
  assert.throws(() => validateDatabaseTarget({ PADOVA_DATABASE_MODE: 'invalid' }));
  assert.throws(() =>
    validateDatabaseTarget({ PADOVA_DATABASE_MODE: 'local', DATABASE_URL: 'set' }),
  );
  assert.doesNotThrow(() => validateDatabaseTarget({ PADOVA_DATABASE_MODE: 'local' }));
});

test('cloud activation checks an existing schema without installing it', async () => {
  const db = await createDatabase(true);
  try {
    await assert.rejects(requireCurrentSchema(db), /not installed/);
    const found = await db.query("SELECT to_regclass('public.schema_migrations') AS name");
    assert.equal(found.rows[0].name, null);
    await migrate(db);
    await requireCurrentSchema(db);
  } finally {
    await db.close();
  }
});

test('hosted isolation denies inherited API grants and preserves legacy schemas and RPCs', async () => {
  const db = await createDatabase(true);
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
      CREATE SCHEMA preserved_legacy;
      CREATE TABLE preserved_legacy.evidence(id integer PRIMARY KEY);
      INSERT INTO preserved_legacy.evidence VALUES(1);
      CREATE FUNCTION public.legacy_reference() RETURNS integer LANGUAGE sql AS 'SELECT 1';`);
    await migrate(db);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const exposed = await db.query(
        `SELECT relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
        AND c.relkind IN ('r','v') AND has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE')`,
        [role],
      );
      assert.equal(exposed.rows.length, 0);
      const sequence = await db.query(
        "SELECT has_sequence_privilege($1,'public.booking_number','USAGE') AS allowed",
        [role],
      );
      assert.equal(sequence.rows[0].allowed, false);
    }
    assert.equal(
      (await db.query('SELECT count(*)::integer AS count FROM preserved_legacy.evidence')).rows[0]
        .count,
      1,
    );
    assert.equal((await db.query('SELECT public.legacy_reference() AS result')).rows[0].result, 1);
  } finally {
    await db.close();
  }
});
