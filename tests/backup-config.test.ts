import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupDatabaseEnvironment, databaseDumpArguments } from '../src/lib/postgres-backup';
import { PADOVA_PROJECT } from '../src/lib/project';

test('backup uses a separate pinned login and explicit verified libpq environment', () => {
  const env = backupDatabaseEnvironment({
    PADOVA_DATABASE_MODE: 'supabase',
    PADOVA_BACKUP_DATABASE_URL: `postgresql://padova_backup.${PADOVA_PROJECT.ref}:example%24pass%40word@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    PADOVA_DB_CA_FILE: 'C:/example/public-ca.crt',
  });
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGHOST, 'aws-0-us-east-1.pooler.supabase.com');
  assert.equal(env.PGUSER, `padova_backup.${PADOVA_PROJECT.ref}`);
  assert.equal(env.PGPASSWORD, 'example$pass@word');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSSLROOTCERT, 'C:/example/public-ca.crt');
  assert.equal(env.PGOPTIONS, '-c default_transaction_read_only=on');
  assert.throws(() => backupDatabaseEnvironment({ DATABASE_URL: 'unused' }), /dedicated/);
  assert.throws(
    () =>
      backupDatabaseEnvironment({
        PADOVA_BACKUP_DATABASE_URL: `postgresql://postgres.${PADOVA_PROJECT.ref}:example@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      }),
    /dedicated/,
  );
  assert.throws(
    () =>
      backupDatabaseEnvironment({
        PADOVA_BACKUP_DATABASE_URL:
          'postgresql://padova_backup.otherproject:example@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      }),
    /Cloud database must/,
  );
  assert.throws(
    () =>
      backupDatabaseEnvironment({
        PADOVA_BACKUP_DATABASE_URL: `postgresql://padova_backup.${PADOVA_PROJECT.ref}:example@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
      }),
    /verify-full/,
  );
  assert.ok(
    !databaseDumpArguments().some(
      (arg) => arg.includes('password') || arg.includes('postgresql://'),
    ),
  );
  assert.ok(databaseDumpArguments().includes('--schema=padova_staging'));
  assert.ok(
    !databaseDumpArguments().includes('--schema=auth'),
    'Managed Auth uses the separately filtered export',
  );
});
