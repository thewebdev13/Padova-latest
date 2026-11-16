import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createDatabase } from '../src/lib/db';
import { login, sessionActor, logout } from '../src/lib/users';
import { importPracticeFinancialPlan, type ImportEvent } from '../src/lib/financial-importer';
// No environment file loading: an explicit local Practice runtime is mandatory.
if (process.env.DATABASE_URL || process.env.PADOVA_DATABASE_MODE === 'supabase')
  throw new Error('Production historical posting remains disabled');
const file = process.argv[2];
if (!file)
  throw new Error(
    'Supply a reviewed event-plan JSON file; no source spreadsheet is interpreted automatically',
  );
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/owner-acceptance');
if (!existsSync(path.join(process.env.PADOVA_DATA_DIR, 'PG_VERSION')))
  throw new Error('Existing Practice required');
const events: ImportEvent[] = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(events)) throw new Error('Plan must be an array of reviewed financial events');
const db = await createDatabase();
let token: string | undefined;
try {
  const session = await login(
    db,
    JSON.parse(await readFile('.data/owner-acceptance-access.json', 'utf8')),
  );
  token = session.token;
  const actor = await sessionActor(db, token);
  if (actor?.role !== 'OWNER' || session.user.email !== 'demo@example.invalid')
    throw new Error('Individual synthetic Owner required');
  const result = await importPracticeFinancialPlan(db, actor, events);
  await writeFile('.data/latest-reviewed-practice-import.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      created: result.created,
      replayed: result.replayed,
      scope: 'Existing Practice only',
    }),
  );
} finally {
  if (token) await logout(db, token);
  await db.close();
}
