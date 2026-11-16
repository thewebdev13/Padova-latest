import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createDatabase } from '../src/lib/db';
import { backupKey, encryptBackup } from '../src/lib/backup';
import {
  backupDatabaseEnvironment,
  databaseDumpArguments,
  postgresTool,
} from '../src/lib/postgres-backup';
const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);
if (!process.env.BACKUP_DIR)
  throw new Error('Set BACKUP_DIR to an owner-controlled restricted backup destination');
const directory = path.resolve(process.env.BACKUP_DIR);
await mkdir(directory, { recursive: true });
let bytes: Buffer, kind: string;
if (process.env.DATABASE_URL) {
  bytes = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(postgresTool('pg_dump'), databaseDumpArguments(), {
      env: backupDatabaseEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.resume();
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(
              'pg_dump failed; verify PostgreSQL client installation and backup credentials',
            ),
          ),
    );
  });
  kind = 'postgres-partial';
} else {
  const db = await createDatabase();
  try {
    bytes = Buffer.from(await (await db.dump!()).arrayBuffer());
  } finally {
    await db.close();
  }
  kind = 'pglite';
}
const output = path.join(
  directory,
  `padova-${kind}-${new Date().toISOString().replaceAll(':', '-')}.enc`,
);
await writeFile(output, encryptBackup(bytes, key), { mode: 0o600, flag: 'wx' });
console.log(`Encrypted ${kind} backup saved: ${output}`);
console.log(
  'This database-only export excludes renewable Auth proofs and plaintext-secret tables. Complete recovery also needs the separate safe Auth-user export, private recovery kit, repository, source files and platform settings. Verify in isolation; scheduling is separate.',
);
