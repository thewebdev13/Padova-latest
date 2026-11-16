import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase, requireCurrentSchema } from '../src/lib/db';
import { bootstrapOwner, issueRecovery, login, logout, sessionActor } from '../src/lib/users';

const [email, name] = process.argv.slice(2);
if (!email || !name) throw new Error('Usage: owner:provision -- <individual-email> <display-name>');
if (process.env.PADOVA_DATABASE_MODE !== 'supabase')
  throw new Error('Owner provisioning requires explicit supabase mode');
const directory = path.resolve('.data/owner-onboarding');
await mkdir(directory, { recursive: true });
const db = await createDatabase();
try {
  await requireCurrentSchema(db);
  const password = randomBytes(48).toString('base64url');
  const owner = await bootstrapOwner(db, { email, name, password });
  // Persist recovery before testing provider/session round trips; never print credentials.
  const file = path.join(directory, `${owner.id}.json`);
  await writeFile(
    file,
    JSON.stringify({ id: owner.id, email, name, recovery_codes: owner.recovery_codes }, null, 2),
    { mode: 0o600, flag: 'wx' },
  );
  const session = await login(db, { email, password });
  const actor = await sessionActor(db, session.token);
  if (!actor || actor.id !== owner.id || actor.role !== 'OWNER')
    throw new Error('Hosted Owner session verification failed; use saved personal recovery codes');
  await logout(db, session.token);
  if (await sessionActor(db, session.token)) throw new Error('Hosted logout verification failed');
  const recovery = await issueRecovery(db, actor, owner.id);
  await writeFile(
    file,
    JSON.stringify(
      { id: owner.id, email, name, recovery_codes: owner.recovery_codes, setup: recovery },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    'Real Owner created; hosted password login, provider verification and logout passed.',
  );
  console.log(`Private setup credential and recovery codes saved in ${directory}.`);
} finally {
  await db.close();
}
