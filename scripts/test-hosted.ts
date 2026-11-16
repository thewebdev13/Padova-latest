import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, requireCurrentSchema } from '../src/lib/db';
import { snapshot } from '../src/lib/queries';
import { execute } from '../src/lib/finance';
import {
  attempt,
  completeRecovery,
  createUser,
  issueRecovery,
  login,
  logout,
  sessionActor,
  updateUser,
} from '../src/lib/users';
import type { Actor } from '../src/lib/permissions';

if (process.env.PADOVA_DATABASE_MODE !== 'supabase')
  throw new Error('Explicit hosted mode required');
const db = await createDatabase();
let qa: any, owner: Actor;
try {
  await requireCurrentSchema(db);
  const rows = (await db.query("SELECT * FROM staff WHERE role='OWNER' AND active=true")).rows;
  assert.equal(rows.length, 1, 'One authorized initial Owner must exist');
  owner = { ...rows[0], authVersion: Number(rows[0].auth_version) } as Actor;
  const metadata = (
    await db.query(`SELECT current_user runtime_role,session_user login_role,
    has_schema_privilege(current_user,'padova_staging','USAGE') staging_access,
    has_table_privilege(current_user,'padova.settings','UPDATE') settings_write,
    (SELECT operational_entry_enabled FROM padova.settings WHERE id=true) entry_enabled`)
  ).rows[0];
  assert.equal(metadata.runtime_role, 'padova_app_server');
  assert.equal(metadata.login_role, 'padova_runtime');
  assert.equal(metadata.staging_access, false);
  assert.equal(metadata.settings_write, false);
  assert.equal(metadata.entry_enabled, false);
  const ownerView = await snapshot(db, owner);
  assert.equal(Number(ownerView.sourceReviewCount), 947);
  const email = `padova-qa-${randomUUID()}@example.invalid`;
  qa = await createUser(db, owner, {
    name: 'Synthetic hosted acceptance — inactive after test',
    email,
  });
  const password = randomBytes(36).toString('base64url');
  const setup = await issueRecovery(db, owner, qa.id);
  await completeRecovery(db, { token: setup.token, password });
  await assert.rejects(() => completeRecovery(db, { token: setup.token, password }));
  let session = await login(db, { email, password });
  let actor = (await sessionActor(db, session.token))!;
  assert.equal(actor.role, 'EMPLOYEE');
  assert.deepEqual([...actor.permissions].sort(), ['edit_payments', 'operations']);
  const employeeView = await snapshot(db, actor);
  assert.equal(Number(employeeView.sourceReviewCount), 0);
  assert.deepEqual(employeeView.sourceReviews, []);
  assert.deepEqual(employeeView.journal, []);
  assert.deepEqual(employeeView.movements, []);
  assert.equal(employeeView.operationalGate, null);
  await assert.rejects(
    () => createUser(db, actor, { name: 'Unauthorized', email: 'forbidden@example.invalid' }),
    /Permission required/,
  );
  await updateUser(db, owner, {
    ...qa,
    permissions: ['operations', 'view_sale_price'],
    reason: 'Hosted acceptance: independent permission',
  });
  assert.equal(await sessionActor(db, session.token), null);
  session = await login(db, { email, password });
  actor = (await sessionActor(db, session.token))!;
  assert.ok(actor.permissions.includes('view_sale_price'));
  assert.ok(!actor.permissions.includes('view_supplier_cost'));
  assert.ok(!actor.permissions.includes('view_total_profit'));
  await logout(db, session.token);
  assert.equal(await sessionActor(db, session.token), null);
  const bucket = `hosted-concurrency:${randomUUID()}`;
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () => db.transaction((tx) => attempt(tx, bucket, 3))),
  );
  assert.equal(
    attempts.filter(Boolean).length,
    3,
    'Concurrent throttle increments must not be lost',
  );
  await assert.rejects(
    () =>
      execute(db, owner, {
        id: randomUUID(),
        kind: 'party',
        data: { name: 'Must not be stored', kind: 'person' },
      }),
    /Operational entry is locked/,
  );
  console.log(
    'Hosted role isolation, provider recovery/replay, personal login/logout, independent grants, stale sessions, Employee denial and concurrent throttling passed.',
  );
} finally {
  if (qa)
    await updateUser(db, owner!, {
      ...qa,
      active: false,
      reason:
        'Hosted acceptance complete; retain synthetic identity and audit, never delete history',
    });
  await db.close();
}
