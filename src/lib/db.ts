import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { configuredDatabaseURL } from './project';
import type { AuthProvider } from './supabase-auth';
import { lazySupabaseAuth } from './supabase-auth';
import { padovaStorage } from './padova-storage';
import { assertQAIsolation } from './qa';
import { PADOVA_QA_PROJECT } from './project';

export type Row = Record<string, any>;
export interface SQL {
  storage?: 'padova';
  authProvider?: AuthProvider;
  query<T extends Row = Row>(sql: string, values?: any[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}
export interface Database extends SQL {
  transaction<T>(fn: (tx: SQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  dump?: () => Promise<Blob>;
}
function normalizeRows<T extends Row>(rows: T[]): T[] {
  return rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value instanceof Date
            ? key.endsWith('_on') || ['travel_start', 'travel_end', 'dob'].includes(key)
              ? value.toISOString().slice(0, 10)
              : value.toISOString()
            : value,
        ]),
      ) as T,
  );
}
function wrap(client: {
  query: (q: string, v?: any[]) => Promise<any>;
  exec?: (q: string) => Promise<any>;
}): SQL {
  return {
    async query<T extends Row = Row>(q: string, v?: any[]) {
      const r = await client.query(q, v);
      return { rows: normalizeRows<T>(r.rows) };
    },
    async exec(q: string) {
      if (client.exec) await client.exec(q);
      else await client.query(q);
    },
  };
}
export async function createDatabase(memory = false, loadDataDir?: Blob): Promise<Database> {
  assertQAIsolation();
  const connectionString = memory ? undefined : configuredDatabaseURL();
  if (connectionString) {
    const pool = new Pool({
      connectionString,
      max: process.env.PADOVA_QA === '1' ? 2 : 5,
      idleTimeoutMillis: 5000,
      maxLifetimeSeconds: 60,
      connectionTimeoutMillis: 15000,
      application_name: 'padova-current-v1',
      options: '-c search_path=padova,pg_catalog',
    });
    // Suspended serverless instances cannot run pg's idle timers on their own.
    if (process.env.VERCEL) attachDatabasePool(pool);
    pool.on('error', (error: Error & { code?: string }) =>
      console.error('Padova idle database connection closed', error.code ?? 'connection'),
    );
    const connect = async () => {
      const client = await pool.connect();
      try {
        await client.query('SET ROLE padova_app_server');
        return client;
      } catch (error) {
        client.release();
        throw error;
      }
    };
    const raw: Database = {
      async query(q, v) {
        const c = await connect();
        try {
          return await wrap(c).query(q, v);
        } finally {
          c.release();
        }
      },
      async exec(q) {
        const c = await connect();
        try {
          await wrap(c).exec(q);
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
      async transaction(fn) {
        const c = await connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT pg_advisory_xact_lock(71280428)');
          const result = await fn(wrap(c));
          await c.query('COMMIT');
          return result;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
    };
    return padovaStorage(raw, lazySupabaseAuth());
  }
  // Local runtime data is never part of a deployable server bundle.
  const dataDir = path.resolve(
    /* turbopackIgnore: true */
    process.env.PADOVA_DATA_DIR ?? path.join(process.cwd(), '.data', 'development'),
  );
  if (!memory) await mkdir(path.dirname(dataDir), { recursive: true });
  const lockPath = `${dataDir}.lock`;
  let release = async () => {};
  if (!memory) {
    let lock;
    try {
      lock = await open(lockPath, 'wx');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const owner = Number(await readFile(lockPath, 'utf8'));
      let alive = true;
      if (!Number.isInteger(owner) || owner <= 0)
        throw new Error('Local database lock is invalid; inspect it before recovery');
      try {
        process.kill(owner, 0);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
      }
      if (alive)
        throw new Error(
          'Local database is already open. Stop the Padova server before running database scripts.',
        );
      await unlink(lockPath);
      lock = await open(lockPath, 'wx');
    }
    await lock.writeFile(String(process.pid));
    const cleanup = () => {
      try {
        if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath);
      } catch {}
    };
    process.once('exit', cleanup);
    release = async () => {
      await lock.close();
      cleanup();
      process.removeListener('exit', cleanup);
    };
  }
  const pg = new PGlite({ dataDir: memory ? undefined : dataDir, loadDataDir });
  await pg.waitReady;
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    dump: () => pg.dumpDataDir(),
    async close() {
      await pg.close();
      await release();
    },
  };
}
export async function migrate(db: Database) {
  if (db.storage === 'padova')
    throw new Error(
      'Existing Padova extensions require reviewed SQL; automatic migrations are prohibited',
    );
  await db.transaction(async (tx) => {
    const found = await tx.query("SELECT to_regclass('public.schema_migrations') AS name");
    if (!found.rows[0].name)
      await tx.exec(await readFile(path.join(process.cwd(), 'db', '001_initial.sql'), 'utf8'));
    for (const version of [
      '002_workflow_integrity',
      '003_settlements',
      '004_api_isolation',
      '005_allocation_reversals',
      '006_deferred_guards',
      '007_refund_basis',
      '008_individual_auth',
      '009_personal_recovery_codes',
      '010_hosted_isolation',
      '011_fulfillment_catalogs',
      '012_reward_reversal_positions',
      '013_booking_entry',
      '014_optional_commission_date',
      '015_unknown_outside_quantity',
      '016_final_entry_integrity',
      '017_obligation_settlement_guard',
      '018_v1_source_profiles',
      '019_commission_payables',
      '020_targeted_entry_reliability',
      '021_partnerships',
      '022_partnership_refresh',
      '023_hotel_directory',
    ]) {
      if (
        !(await tx.query('SELECT version FROM schema_migrations WHERE version=$1', [version])).rows
          .length
      ) {
        await tx.exec(await readFile(path.join(process.cwd(), 'db', `${version}.sql`), 'utf8'));
      }
    }
  });
}
export async function requireCurrentSchema(db: Database) {
  if (db.storage === 'padova') {
    if (process.env.PADOVA_QA === '1') {
      const marker = (
        await db.query('SELECT project_ref,data_class FROM padova.qa_environment WHERE id=true')
      ).rows[0];
      if (marker?.project_ref !== PADOVA_QA_PROJECT.ref || marker?.data_class !== 'synthetic')
        throw new Error('Hosted QA database identity could not be verified');
    }
    const found = await db.query("SELECT to_regclass('padova.app_schema_versions') AS name");
    if (!found.rows[0]?.name)
      throw new Error(
        'Existing Padova adapter extensions are not installed; Owner review is required',
      );
    if (
      !(
        await db.query(
          "SELECT version FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter'",
        )
      ).rows.length
    )
      throw new Error('Existing Padova adapter version is missing; Owner review is required');
    return;
  }
  const found = await db.query("SELECT to_regclass('public.schema_migrations') AS name");
  if (!found.rows[0]?.name)
    throw new Error('Cloud schema is not installed; resolve migration approval before activation');
  const current = await db.query('SELECT version FROM public.schema_migrations WHERE version=$1', [
    '010_hosted_isolation',
  ]);
  if (!current.rows.length)
    throw new Error('Cloud schema is outdated; apply approved migrations before activation');
}
const globalDB = globalThis as unknown as { padovaDB?: Promise<Database> };
export function database() {
  if (globalDB.padovaDB) return globalDB.padovaDB;
  const pending = (async () => {
    const db = await createDatabase();
    try {
      if (db.storage === 'padova' || process.env.DATABASE_URL) await requireCurrentSchema(db);
      else await migrate(db);
      return db;
    } catch (error) {
      await db.close();
      throw error;
    }
  })();
  globalDB.padovaDB = pending;
  void pending.catch(() => {
    if (globalDB.padovaDB === pending) delete globalDB.padovaDB;
  });
  return pending;
}
export async function one(tx: SQL, sql: string, values: any[] = []): Promise<Row> {
  const r = await tx.query(sql, values);
  if (!r.rows.length) throw new Error('Record not found');
  return r.rows[0];
}
