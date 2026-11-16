import { Client } from 'pg';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { backupKey, decryptBackup } from '../src/lib/backup';
import { decodeRecovery } from '../src/lib/recovery-archive';
import { postgresTool } from '../src/lib/postgres-backup';
import {
  recoveryTableInventory,
  recoveryCompactInventory,
  RECOVERY_FINGERPRINT_ALGORITHM,
} from '../src/lib/recovery-inventory';

const exec = promisify(execFile),
  quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
if (!process.argv[2])
  throw new Error(
    'Supply an encrypted recovery archive; this tool creates only a fresh isolated local cluster',
  );
const directory = path.resolve('.data/restore-tests', randomUUID());
await mkdir(directory, { recursive: true });
const archive = decodeRecovery(
  gunzipSync(
    decryptBackup(await readFile(process.argv[2]), backupKey(process.env.BACKUP_ENCRYPTION_KEY)),
  ),
);
if (archive.format !== 'padova-recovery-v1') throw new Error('Unsupported recovery archive');
for (const entry of archive.entries) {
  const file = path.resolve(directory, entry.path);
  if (!file.startsWith(directory + path.sep)) throw new Error('Unsafe archive path');
  const bytes = Buffer.from(entry.base64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error('Recovery file checksum mismatch');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { mode: 0o600, flag: 'wx' });
}
const inventory = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
const auth = JSON.parse(await readFile(path.join(directory, 'auth-safe.json'), 'utf8'));
const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((resolve) => probe.close(() => resolve()));
const password = randomBytes(48).toString('hex'),
  passwordFile = path.join(directory, 'local-password');
await writeFile(passwordFile, password, { mode: 0o600, flag: 'wx' });
const cluster = path.join(directory, 'cluster');
const env = {
  ...process.env,
  PGHOST: '127.0.0.1',
  PGPORT: String(port),
  PGDATABASE: 'postgres',
  PGUSER: 'padova_restore_admin',
  PGPASSWORD: password,
  PGSSLMODE: 'disable',
  PGOPTIONS: '',
};
const run = (tool: string, args: string[]) =>
  tool === 'pg_ctl'
    ? new Promise<{ stdout: string }>((resolve, reject) => {
        // On Windows the detached server can retain inherited pipe handles after pg_ctl exits.
        const child = spawn(postgresTool(tool), args, { env, windowsHide: true, stdio: 'ignore' });
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? resolve({ stdout: '' })
            : reject(new Error('Isolated PostgreSQL control failed; inspect its local log')),
        );
      })
    : exec(postgresTool(tool), args, { env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
await run('initdb', [
  '-D',
  cluster,
  '-U',
  'padova_restore_admin',
  '--auth=scram-sha-256',
  `--pwfile=${passwordFile}`,
  '--encoding=UTF8',
  '--locale=C',
]);
let started = false;
const client = new Client({
  host: '127.0.0.1',
  port,
  database: 'postgres',
  user: 'padova_restore_admin',
  password,
  ssl: false,
});
try {
  await run('pg_ctl', [
    '-D',
    cluster,
    '-l',
    path.join(directory, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    'start',
  ]);
  started = true;
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  const existing = new Set(
    (await client.query('SELECT rolname FROM pg_roles')).rows.map((r) => r.rolname),
  );
  for (const role of inventory.roles) {
    if (existing.has(role.rolname)) continue;
    await client.query(
      `CREATE ROLE ${quote(role.rolname)} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION ${role.rolinherit ? 'INHERIT' : 'NOINHERIT'} ${role.rolbypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`,
    );
  }
  await client.query(await readFile(path.join(directory, 'auth-schema.sql'), 'utf8'));
  for (const [table, rows] of Object.entries(auth.tables) as [
    string,
    Record<string, unknown>[],
  ][]) {
    const columns = inventory.authColumns.filter(
      (c: any) => c.table_name === table && !c.generated,
    );
    for (const row of rows) {
      const present = columns.filter((c: any) => Object.hasOwn(row, c.name));
      if (!present.length) continue;
      await client.query(
        `INSERT INTO auth.${quote(table)} (${present.map((c: any) => quote(c.name)).join(',')}) VALUES (${present.map((_: any, i: number) => '$' + (i + 1)).join(',')})`,
        present.map((c: any) =>
          ['json', 'jsonb'].includes(c.type) && row[c.name] !== null
            ? JSON.stringify(row[c.name])
            : row[c.name],
        ),
      );
    }
  }
  await client.query(await readFile(path.join(directory, 'auth-constraints.sql'), 'utf8'));
  for (const [table, rows] of Object.entries(auth.tables) as [
    string,
    Record<string, unknown>[],
  ][]) {
    const blocked = inventory.authColumns
      .filter(
        (c: any) =>
          c.table_name === table &&
          /(token|secret)/.test(c.name) &&
          !['token_hash', 'client_secret_hash', 'token_endpoint_auth_method'].includes(c.name),
      )
      .map((c: any) => c.name);
    const restored = (
      await client.query(`SELECT to_jsonb(r)-$1::text[] data FROM auth.${quote(table)} r`, [
        blocked,
      ])
    ).rows
      .map((r) => JSON.stringify(r.data))
      .sort();
    const expected = rows.map((row) => JSON.stringify(row)).sort();
    if (JSON.stringify(restored) !== JSON.stringify(expected))
      throw new Error(`Safe Auth recovery values differ: ${table}`);
  }
  const toc = (await run('pg_restore', ['--list', path.join(directory, 'database.dump')])).stdout;
  await writeFile(
    path.join(directory, 'restore.list'),
    toc
      .split('\n')
      .filter((l) => !/^\d+; .* SCHEMA - public /.test(l))
      .join('\n'),
  );
  await run('pg_restore', [
    '--exit-on-error',
    '--no-owner',
    `--use-list=${path.join(directory, 'restore.list')}`,
    '--dbname=postgres',
    path.join(directory, 'database.dump'),
  ]);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  for (const table of inventory.tables) {
    if (table.fingerprint_algorithm) {
      if (table.fingerprint_algorithm !== RECOVERY_FINGERPRINT_ALGORITHM)
        throw new Error('Unsupported recovery inventory fingerprint algorithm');
      const actual = await recoveryCompactInventory(client, table.schema, table.name);
      if (actual.count !== table.count || actual.fingerprint !== table.fingerprint)
        throw new Error(`Restored values differ: ${table.schema}.${table.name}`);
      continue;
    }
    const actual = await recoveryTableInventory(client, table.schema, table.name);
    if (
      actual.count !== table.count ||
      (table.canonical_hash
        ? actual.canonical_hash !== table.canonical_hash
        : actual.hash !== table.hash)
    )
      throw new Error(`Restored values differ: ${table.schema}.${table.name}`);
  }
  await client.query('COMMIT');
  const gate = (await client.query('SELECT * FROM padova.settings')).rows[0];
  // Values were compared above; disable writes only in this new isolated restore target.
  await client.query('UPDATE padova.settings SET operational_entry_enabled=false WHERE id=true');
  const balance = (
    await client.query(
      'SELECT COALESCE(sum(debit-credit),0)::text amount FROM padova.journal_lines',
    )
  ).rows[0];
  if (Number(balance.amount) !== 0) throw new Error('Restored journal is unbalanced');
  const receipt = {
    result: 'domain_database_restore_passed',
    restoredTables: inventory.tables.length,
    authUsers: auth.tables.users.length,
    allOriginalTableValuesMatch: true,
    operationalEntryEnabled: false,
    limitations: inventory.incomplete,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(path.join(directory, 'restore-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ directory, ...receipt }));
} finally {
  await client.end().catch(() => {});
  if (started) await run('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
}
