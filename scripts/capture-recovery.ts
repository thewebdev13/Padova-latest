import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { backupKey, encryptBackup } from '../src/lib/backup';
import { encodeRecovery } from '../src/lib/recovery-archive';
import { recoveryCompactInventory } from '../src/lib/recovery-inventory';
import { configuredDatabaseURL, PADOVA_PROJECT } from '../src/lib/project';
import {
  backupDatabaseEnvironment,
  databaseDumpArguments,
  postgresTool,
} from '../src/lib/postgres-backup';

const exec = promisify(execFile);
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const hash = (s: Buffer) => createHash('sha256').update(s).digest('hex');
const directory = path.resolve('.data/recovery-captures', randomUUID());
await mkdir(directory, { recursive: true });
const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);
const connectionString = configuredDatabaseURL({
  ...process.env,
  DATABASE_URL: process.env.PADOVA_BACKUP_DATABASE_URL,
});
if (!connectionString) throw new Error('Dedicated backup connection required');
const client = new Client({ connectionString, connectionTimeoutMillis: 15000, keepAlive: true });
let connectionFailure: Error | undefined;
let activeDump: ReturnType<typeof spawn> | undefined;
client.on('error', (error: Error) => {
  connectionFailure = error;
  activeDump?.kill();
});
try {
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await client.query('SELECT pg_export_snapshot() id')).rows[0].id;
  const auth = (await client.query('SELECT padova.backup_auth_snapshot() data')).rows[0].data;
  const sourceFiles = (
    await client.query('SELECT path,sha256,bytes FROM padova_staging.evidence_files ORDER BY path')
  ).rows;
  await writeFile(path.join(directory, 'auth-safe.json'), JSON.stringify(auth));
  const roles = (
    await client.query(
      `SELECT rolname,rolinherit,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication,rolsuper FROM pg_roles ORDER BY rolname`,
    )
  ).rows;
  const memberships = (
    await client.query(
      `SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2`,
    )
  ).rows;
  const relations = (
    await client.query(
      `SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('padova','padova_staging','padova_test_20261027','padova_test_20261027_auth','padova_test_20261027_staging') AND c.relkind='r' ORDER BY 1,2`,
    )
  ).rows;
  const tables = [];
  for (const table of relations) {
    const stats = await recoveryCompactInventory(client, table.schema, table.name);
    tables.push({ ...table, ...stats });
  }
  const authTypes = (
    await client.query(
      `SELECT t.typname name,string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='auth' GROUP BY t.typname ORDER BY t.typname`,
    )
  ).rows;
  const authColumns = (
    await client.query(
      `SELECT c.relname table_name,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='auth' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    )
  ).rows;
  const sequences = (
    await client.query(
      `SELECT c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relkind='S'`,
    )
  ).rows;
  const authFunctions = (
    await client.query(
      `SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.prokind='f' ORDER BY p.proname`,
    )
  ).rows;
  const constraints = (
    await client.query(
      `SELECT c.relname table_name,k.conname name,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' ORDER BY CASE k.contype WHEN 'f' THEN 1 ELSE 0 END,c.relname,k.conname`,
    )
  ).rows;
  const indexes = (
    await client.query(
      `SELECT pg_get_indexdef(i.indexrelid) indexdef FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid) ORDER BY i.indexrelid`,
    )
  ).rows;
  let sql =
    'CREATE SCHEMA auth;\nCREATE SCHEMA extensions;\nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;\n';
  for (const t of authTypes) sql += `CREATE TYPE auth.${quote(t.name)} AS ENUM (${t.labels});\n`;
  for (const s of sequences) sql += `CREATE SEQUENCE auth.${quote(s.name)};\n`;
  for (const table of [...new Set(authColumns.map((c) => c.table_name))]) {
    const cols = authColumns
      .filter((c) => c.table_name === table)
      .map(
        (c) =>
          `${quote(c.name)} ${c.type}${c.generated ? ` GENERATED ALWAYS AS (${c.default_value}) STORED` : c.default_value ? ` DEFAULT ${c.default_value}` : ''}${c.not_null ? ' NOT NULL' : ''}`,
      );
    sql += `CREATE TABLE auth.${quote(table)} (${cols.join(',')});\n`;
  }
  for (const f of authFunctions) sql += f.definition + ';\n';
  await writeFile(path.join(directory, 'auth-schema.sql'), sql);
  await writeFile(
    path.join(directory, 'auth-constraints.sql'),
    constraints
      .map(
        (c) =>
          `ALTER TABLE auth.${quote(c.table_name)} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`,
      )
      .join('\n') +
      '\n' +
      indexes.map((i) => i.indexdef + ';').join('\n'),
  );
  const vault = (await client.query('SELECT * FROM vault.secrets')).rows;
  const storage = (await client.query('SELECT * FROM storage.objects')).rows;
  const buckets = (await client.query('SELECT * FROM storage.buckets')).rows;
  await writeFile(
    path.join(directory, 'managed-metadata.json'),
    JSON.stringify({ vault_encrypted: vault, storage_objects: storage, storage_buckets: buckets }),
  );
  const inventory = {
    project: PADOVA_PROJECT,
    capturedAt: new Date().toISOString(),
    roles,
    memberships,
    tables,
    authColumns,
    scope:
      'Padova/staging/test/public/migration SQL plus safe Auth identities/schema and encrypted Vault/Storage metadata. Private keys/credentials are kept separately.',
    sourceFiles,
    incomplete: [
      'Managed-platform configuration/account recovery must be preserved in the separate Recovery Kit',
      ...(storage.length ? ['Storage object bytes are not yet downloaded'] : []),
      ...(vault.length
        ? ['Vault root-key/secret recovery requires separately controlled material']
        : []),
    ],
  };
  await writeFile(path.join(directory, 'inventory.json'), JSON.stringify(inventory, null, 2));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      postgresTool('pg_dump'),
      [
        ...databaseDumpArguments(),
        `--snapshot=${snapshot}`,
        `--file=${path.join(directory, 'database.dump')}`,
      ],
      { env: backupDatabaseEnvironment(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    activeDump = child;
    let heartbeatPending = false;
    const heartbeat = setInterval(() => {
      if (heartbeatPending) return;
      heartbeatPending = true;
      const deadline = setTimeout(() => {
        connectionFailure = new Error('Backup snapshot heartbeat timed out');
        child.kill();
      }, 15000);
      void client
        .query('SELECT 1')
        .catch((error: Error) => {
          connectionFailure = error;
          child.kill();
        })
        .finally(() => {
          clearTimeout(deadline);
          heartbeatPending = false;
        });
    }, 30000);
    const finish = () => {
      clearInterval(heartbeat);
      activeDump = undefined;
    };
    let error = '';
    child.stderr.on('data', (c) => {
      error += c.toString();
    });
    child.on('error', () => {
      finish();
      reject(new Error('pg_dump executable failed'));
    });
    child.on('exit', (code) => {
      finish();
      if (connectionFailure)
        reject(
          new Error('Backup snapshot connection lost; partial capture is not a recovery archive'),
        );
      else if (code === 0) resolve();
      else reject(new Error(`Read-only pg_dump failed: ${error.slice(0, 1000)}`));
    });
  });
  await client.query('COMMIT');
  await exec('git', ['bundle', 'create', path.join(directory, 'repository.bundle'), '--all'], {
    windowsHide: true,
  });
  const tracked = (await exec('git', ['ls-files', '-z'], { encoding: 'utf8' })).stdout
    .split('\0')
    .filter(Boolean);
  const untracked = (
    await exec('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  ).stdout
    .split('\0')
    .filter(Boolean);
  const entries: { path: string; sha256: string; base64: string }[] = [];
  async function add(name: string, file: string) {
    const bytes = await readFile(file);
    entries.push({ path: name, sha256: hash(bytes), base64: bytes.toString('base64') });
  }
  for (const f of [
    'database.dump',
    'auth-safe.json',
    'auth-schema.sql',
    'auth-constraints.sql',
    'managed-metadata.json',
    'inventory.json',
    'repository.bundle',
  ])
    await add(f, path.join(directory, f));
  const evidenceRoot = process.env.PADOVA_EVIDENCE_ROOT;
  if (!evidenceRoot)
    throw new Error('PADOVA_EVIDENCE_ROOT is required to include registered source bytes');
  const sourceRoot = path.resolve(evidenceRoot, 'application-backup/sources');
  const currentRoot = path.resolve(evidenceRoot, 'current-sheets/20261027T195340934Z');
  for (const file of sourceFiles) {
    const root = file.path.startsWith('current-sheets/') ? currentRoot : sourceRoot;
    const legacyPath = path.resolve(
      root,
      file.path.startsWith('current-sheets/') ? path.basename(file.path) : file.path,
    );
    if (!legacyPath.startsWith(root + path.sep)) throw new Error('Unsafe evidence path');
    const flatRoot = path.resolve(evidenceRoot),
      flatPath = path.resolve(flatRoot, file.path);
    if (!flatPath.startsWith(flatRoot + path.sep)) throw new Error('Unsafe evidence path');
    const actual = existsSync(flatPath) ? flatPath : legacyPath;
    const bytes = await readFile(actual);
    if (hash(bytes) !== file.sha256 || bytes.length !== Number(file.bytes))
      throw new Error('Registered evidence bytes do not match the preserved manifest');
    entries.push({
      path: `evidence/${file.path}`,
      sha256: hash(bytes),
      base64: bytes.toString('base64'),
    });
  }
  for (const f of [...new Set([...tracked, ...untracked])]) {
    if (f.startsWith('.env') && f !== '.env.example')
      throw new Error('Private environment unexpectedly tracked');
    await add(`repository/${f}`, f);
  }
  const archive = encryptBackup(
    gzipSync(encodeRecovery({ format: 'padova-recovery-v1', entries })),
    key,
  );
  const output = path.join(directory, 'padova-recovery.enc');
  await writeFile(output, archive, { mode: 0o600, flag: 'wx' });
  await writeFile(
    path.join(directory, 'archive-receipt.json'),
    JSON.stringify(
      { file: output, bytes: archive.length, sha256: hash(archive), entries: entries.length },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      directory,
      encryptedArchive: output,
      entries: entries.length,
      bytes: archive.length,
      coverageComplete: false,
    }),
  );
} finally {
  await client.end().catch(() => {});
}
