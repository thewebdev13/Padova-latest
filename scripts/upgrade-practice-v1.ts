import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDatabase, migrate } from '../src/lib/db';
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Local Practice only');
process.env.PADOVA_DATABASE_MODE = 'local';
const fixture = process.env.PADOVA_QA === '1' ? 'remote-qa' : 'owner-acceptance';
process.env.PADOVA_DATA_DIR = path.resolve(`.data/${fixture}`);
const db = await createDatabase();
try {
  const buffer = Buffer.from(await (await db.dump!()).arrayBuffer());
  await mkdir('.data/master-backups', { recursive: true });
  const target = `.data/master-backups/${fixture}-before-v1-${Date.now()}.tar.gz`;
  await writeFile(target, buffer);
  await writeFile(`${target}.sha256`, createHash('sha256').update(buffer).digest('hex'));
  await migrate(db);
  console.log(
    'Existing Practice backed up and additively upgraded. No source or production connection.',
  );
} finally {
  await db.close();
}
