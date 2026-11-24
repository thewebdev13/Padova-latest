import { randomBytes, randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.resolve('.data/ui-qa-db');
delete process.env.DATABASE_URL;

rmSync(process.env.PADOVA_DATA_DIR, { recursive: true, force: true });
mkdirSync(process.env.PADOVA_DATA_DIR, { recursive: true });

const { createDatabase, migrate } = await import('../src/lib/db.ts');
const { bootstrapOwner } = await import('../src/lib/users.ts');
const users = await import('../src/lib/users.ts');
const { execute } = await import('../src/lib/finance.ts');
const { OWNER_PERMISSIONS } = await import('../src/lib/permissions.ts');

const email = 'ui.qa.desktop@example.invalid';
const password = `UiQa-${randomBytes(10).toString('base64url')}`;
const db = await createDatabase();
try {
  await migrate(db);
  const owner = await bootstrapOwner(db, { email, name: 'UI QA Desktop', password });
  const actor = {
    id: owner.id,
    name: owner.name,
    role: 'OWNER',
    permissions: OWNER_PERMISSIONS,
  };
  const run = (kind, data) => execute(db, actor, { id: randomUUID(), kind, data });
  await run('party', {
    kind: 'person',
    name: 'UI QA Traveler',
    roles: ['customer', 'traveler'],
  });
  await run('party', {
    kind: 'supplier',
    name: 'UI QA Airline',
    roles: ['supplier', 'airline'],
  });
  const loginFn = users.login || users.signIn || users.authenticate;
  if (typeof loginFn === 'function') {
    const session = await loginFn(db, { email, password });
    console.log('login_ok', Boolean(session?.token));
  }
  mkdirSync('.data/ui-qa', { recursive: true });
  writeFileSync('.data/ui-qa/local-owner.json', JSON.stringify({ email, password }, null, 2));
  console.log(JSON.stringify({ ok: true, email }));
} finally {
  if (typeof db.end === 'function') await db.end().catch(() => {});
}
