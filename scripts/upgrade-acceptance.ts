import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDatabase, migrate } from '../src/lib/db';

if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Existing synthetic local fixture only');
process.env.PADOVA_DATABASE_MODE = 'local';
if (
  process.env.PADOVA_DATA_DIR &&
  path.resolve(process.env.PADOVA_DATA_DIR) !== path.resolve('.data/owner-acceptance')
)
  throw new Error(
    'Refuse a different fixture path; choose the existing Owner acceptance fixture explicitly',
  );
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(path.join(process.env.PADOVA_DATA_DIR, 'PG_VERSION')))
  throw new Error('Existing fixture required; never initialize or reset');
const db = await createDatabase();
try {
  const dump = Buffer.from(await (await db.dump!()).arrayBuffer());
  const hash = createHash('sha256').update(dump).digest('hex');
  const root = '.data/acceptance-upgrades';
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, `${hash}.tar.gz`), dump);
  await migrate(db);
  console.log(
    JSON.stringify({ backupSha256: hash, migratedExistingFixture: true, staffReset: false }),
  );
} finally {
  await db.close();
}
