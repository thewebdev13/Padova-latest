import { randomBytes } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';

const { createDatabase } = await import('../src/lib/db.ts');
const { bootstrapOwner } = await import('../src/lib/users.ts');
const { login } = await import('../src/lib/auth.ts');

process.env.PADOVA_DATABASE_MODE = process.env.PADOVA_DATABASE_MODE || 'local';

const email = 'ui.qa.desktop@example.invalid';
const password = `UiQa-${randomBytes(10).toString('base64url')}`;
const db = await createDatabase();
try {
  const staff = await db.query(
    'SELECT id, email, name, role FROM staff ORDER BY created_at NULLS LAST LIMIT 10',
  );
  console.log('staff_count', staff.rows.length);
  const existing = await db.query('SELECT id FROM staff WHERE lower(email)=lower($1)', [email]);
  if (!existing.rows.length) {
    await bootstrapOwner(db, { email, name: 'UI QA Desktop', password });
    console.log('created_owner');
  } else {
    // Owner already exists — rotate password via SQL only if schema allows; else new email.
    const alt = `ui.qa.desktop.${Date.now()}@example.invalid`;
    await bootstrapOwner(db, { email: alt, name: 'UI QA Desktop', password });
    console.log('created_alt', alt);
    mkdirSync('.data/ui-qa', { recursive: true });
    writeFileSync('.data/ui-qa/local-owner.json', JSON.stringify({ email: alt, password }, null, 2));
    const session = await login(db, { email: alt, password });
    console.log(JSON.stringify({ ok: true, email: alt, hasToken: Boolean(session?.token) }));
    process.exit(0);
  }
  const session = await login(db, { email, password });
  mkdirSync('.data/ui-qa', { recursive: true });
  writeFileSync('.data/ui-qa/local-owner.json', JSON.stringify({ email, password }, null, 2));
  console.log(JSON.stringify({ ok: true, email, hasToken: Boolean(session?.token) }));
} finally {
  if (typeof db.end === 'function') await db.end().catch(() => {});
}
