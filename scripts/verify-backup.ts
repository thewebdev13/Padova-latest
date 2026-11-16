import { readFile } from 'node:fs/promises';
import { createDatabase, one } from '../src/lib/db';
import { backupKey, decryptBackup } from '../src/lib/backup';
import { padovaStorage } from '../src/lib/padova-storage';
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run backup:verify -- <encrypted-pglite-backup>');
if (!file.includes('pglite'))
  throw new Error(
    'This local verification tool accepts PGlite backups; production pg_dump recovery requires an isolated PostgreSQL target',
  );
const plain = decryptBackup(await readFile(file), backupKey(process.env.BACKUP_ENCRYPTION_KEY));
const restored = await createDatabase(true, new Blob([new Uint8Array(plain)]));
const existing = (await restored.query("SELECT to_regclass('padova.app_schema_versions') AS name"))
  .rows[0]?.name;
const db = existing ? padovaStorage(restored) : restored;
try {
  const bookings = await one(db, 'SELECT count(*) count FROM bookings');
  const assets = await one(
    db,
    'SELECT count(*) count FROM asset_balances WHERE balance<0 OR remaining_basis<0',
  );
  const journal = await one(db, 'SELECT COALESCE(sum(debit-credit),0) amount FROM journal_lines');
  if (Number(assets.count) !== 0 || Number(journal.amount) !== 0)
    throw new Error('Restored financial invariants failed');
  console.log(
    `Isolated restore succeeded: ${bookings.count} bookings; balanced journal; nonnegative asset balances.`,
  );
} finally {
  await db.close();
}
