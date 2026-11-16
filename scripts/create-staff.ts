import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, requireCurrentSchema } from '../src/lib/db';
import { bootstrapOwner } from '../src/lib/users';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('Staff email: ')).trim().toLowerCase();
const name = (await rl.question('Staff display name: ')).trim();
rl.close();
if (!/^\S+@\S+\.\S+$/.test(email) || !name)
  throw new Error('Valid individual email and name are required');
if (!process.stdin.isTTY) throw new Error('Use an interactive terminal for hidden password entry');
process.stdout.write('Password (14+ characters, hidden): ');
process.stdin.setRawMode(true);
process.stdin.resume();
const password = await new Promise<string>((resolve, reject) => {
  let value = '';
  const handler = (chunk: Buffer) => {
    for (const c of chunk.toString()) {
      if (c === '\u0003') {
        process.stdin.off('data', handler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        reject(new Error('Cancelled'));
        return;
      }
      if (c === '\r' || c === '\n') {
        process.stdin.off('data', handler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
      else value += c;
    }
  };
  process.stdin.on('data', handler);
});
const db = await createDatabase();
try {
  if (process.env.DATABASE_URL) await requireCurrentSchema(db);
  else await migrate(db);
  const owner = await bootstrapOwner(db, { email, name, password });
  console.log('Personal recovery codes: store these privately offline; each works once.');
  for (const code of owner.recovery_codes) console.log(code);
  console.log(
    'Initial individual Owner created. Add all further users through authenticated Users & Permissions. No shared login or password was created.',
  );
} finally {
  await db.close();
}
