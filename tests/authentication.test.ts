import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, migrate, Database, one } from '../src/lib/db';
import {
  bootstrapOwner,
  login,
  logout,
  sessionActor,
  createUser,
  updateUser,
  listUsers,
  requestRecovery,
  issueRecovery,
  completeRecovery,
  changePassword,
  regeneratePersonalCodes,
  recoverWithPersonalCode,
} from '../src/lib/users';
import {
  Actor,
  EMPLOYEE_PERMISSIONS,
  OWNER_PERMISSIONS,
  hasPermission,
} from '../src/lib/permissions';
import { execute, CommandKind } from '../src/lib/finance';
import { snapshot, detail } from '../src/lib/queries';
import { tokenHash } from '../src/lib/credentials';
let db: Database,
  owner: Actor,
  ownerID: string,
  serial = 0;
let ownerCodes: string[] = [];
const ownerPassword = 'Synthetic owner password for isolated tests';
before(async () => {
  db = await createDatabase(true);
  await migrate(db);
  const u = await bootstrapOwner(db, {
    name: 'Synthetic Owner',
    email: 'owner@example.invalid',
    password: ownerPassword,
  });
  ownerID = u.id;
  ownerCodes = u.recovery_codes;
  owner = (await sessionActor(
    db,
    (await login(db, { email: u.email, password: ownerPassword })).token,
  ))!;
});
after(async () => {
  await db.close();
});
const cmd = (actor: Actor, kind: CommandKind, data: unknown) =>
  execute(db, actor, { id: randomUUID(), kind, data });
async function employee(permissions: string[] = [...EMPLOYEE_PERMISSIONS]) {
  const u = await createUser(db, owner, {
    name: `Worker ${++serial}`,
    email: `worker${serial}@example.invalid`,
    permissions,
    role: 'EMPLOYEE',
  });
  const recovery = await issueRecovery(db, owner, u.id),
    password = `Synthetic worker ${serial} password only`;
  await completeRecovery(db, { token: recovery.token, password });
  const session = await login(db, { email: u.email, password });
  return {
    user: u,
    password,
    token: session.token,
    actor: (await sessionActor(db, session.token))!,
  };
}
async function access(
  u: ReturnType<typeof employee> extends Promise<infer T> ? T : never,
  permissions: string[],
) {
  await updateUser(db, owner, {
    ...u.user,
    permissions,
    reason: 'Test explicit permission change',
  });
  const session = await login(db, { email: u.user.email, password: u.password });
  u.token = session.token;
  u.actor = (await sessionActor(db, u.token))!;
}
test('individual accounts have distinct sessions; Plan v1 staff see booking money but not company totals', async () => {
  const a = await employee(),
    b = await employee();
  assert.notEqual(a.actor.id, b.actor.id);
  assert.notEqual(a.token, b.token);
  assert.equal(a.actor.role, 'EMPLOYEE');
  for (const p of [
    'view_sale_price',
    'view_supplier_cost',
    'view_booking_profit',
    'view_asset_basis',
    'manage_funding',
  ] as const)
    assert.ok(hasPermission(a.actor, p), p);
  for (const p of [
    'view_total_profit',
    'view_accounting',
    'manage_users',
    'manage_settings',
    'view_audit',
  ] as const)
    assert.ok(!hasPermission(a.actor, p), p);
  for (const p of OWNER_PERMISSIONS) assert.ok(hasPermission(owner, p));
  await assert.rejects(
    () =>
      bootstrapOwner(db, {
        name: 'Another',
        email: 'another@example.invalid',
        password: ownerPassword,
      }),
    /already provisioned/,
  );
});
test('default staff see per-booking prices/costs and traveler details; company totals stay hidden', async () => {
  const u = await employee(),
    customer = await cmd(owner, 'party', {
      name: 'Visibility customer',
      kind: 'person',
      roles: ['customer', 'traveler', 'seller'],
    }),
    supplier = await cmd(owner, 'party', {
      name: 'Visibility supplier',
      kind: 'supplier',
      roles: ['seller', 'airline', 'property', 'rental'],
    });
  const b = await cmd(owner, 'booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'Visibility case',
    booked_on: '2026-10-28',
    travel_start: '2027-01-01',
    travel_end: '2027-01-02',
    sale: 128987,
  });
  await cmd(owner, 'fund', {
    booking_id: b.id,
    kind: 'Card',
    face_amount: 73545,
    date: '2026-10-28',
  });
  await cmd(owner, 'traveler', {
    person_id: customer.id,
    legal_first: 'Synthetic',
    last_name: 'Traveler',
    dob: '1990-01-02',
    ktn: 'PRIVATE-SYNTHETIC-KTN',
  });
  await cmd(owner, 'acquire_asset', {
    name: 'Visibility asset',
    kind: 'Voucher',
    issuer: 'Test',
    quantity: 100000,
    cost: 79661,
    date: '2026-10-28',
  });
  const s = await snapshot(db, u.actor),
    d = await detail(db, u.actor, 'booking', b.id),
    p = await detail(db, u.actor, 'person', customer.id);
  const bookingRow = s.bookings.find((x) => x.id === b.id)!;
  assert.equal(bookingRow.sale, 128987);
  assert.equal(d.booking.sale, 128987);
  assert.ok(bookingRow.funding_cost != null || d.booking.funding_cost != null);
  // Company-wide accounting / profit movements stay Owner-only.
  assert.deepEqual(s.journal, []);
  assert.deepEqual(s.movements, []);
  // Plan v1: staff may use traveler details for daily booking work.
  assert.ok(p.privateData);
  assert.equal(p.privateData.ktn, 'PRIVATE-SYNTHETIC-KTN');
  // Explicit revoke still hides traveler secrets server-side.
  await access(u, EMPLOYEE_PERMISSIONS.filter((x) => x !== 'view_traveler_sensitive'));
  const hidden = await detail(db, u.actor, 'person', customer.id);
  assert.equal(hidden.privateData, null);
  assert.ok(!JSON.stringify(hidden).includes('PRIVATE-SYNTHETIC-KTN'));
});
test('shared booking notes retain individual author/time and join automatic payment activity', async () => {
  const worker = await employee(['operations']);
  const customer = await cmd(owner, 'party', {
    name: 'Activity customer',
    kind: 'person',
    roles: ['customer'],
  });
  const booking = await cmd(owner, 'booking', {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'Activity booking',
    booked_on: '2026-11-01',
    travel_start: '2026-12-01',
    travel_end: '2026-12-01',
    sale: 15000,
  });
  const id = randomUUID();
  const note = {
    record_type: 'booking',
    record_id: booking.id,
    body: 'Called Delta; refund pending. Evidence: https://mail.google.com/mail/u/0/#all/synthetic-reference',
  };
  await execute(db, worker.actor, { id, kind: 'note', data: note });
  await execute(db, worker.actor, { id, kind: 'note', data: note });
  await cmd(owner, 'payment', {
    direction: 'customer',
    party_id: customer.id,
    amount: 5000,
    date: '2026-11-01',
    method: 'Zelle',
    allocations: [{ booking_id: booking.id, amount: 5000 }],
  });
  for (const actor of [owner, worker.actor]) {
    const result = await detail(db, actor, 'booking', booking.id);
    assert.equal(result.notes.length, 1);
    assert.equal(result.notes[0].body, note.body);
    assert.equal(result.notes[0].actor, worker.actor.id);
    assert.equal(result.notes[0].actor_name, worker.actor.name);
    assert.ok(Number.isFinite(new Date(result.notes[0].created_at).getTime()));
    assert.ok(result.activity.some((a: any) => a.kind === 'booking'));
    assert.ok(result.activity.some((a: any) => a.kind === 'payment'));
    if (actor.role !== 'OWNER')
      for (const a of result.activity) assert.equal(a.after_value, undefined);
  }
});

test('each sensitive read permission can be granted independently without exposing other financial fields', async () => {
  const u = await employee();
  const cases = [
    ['view_sale_price', 'sale'],
    ['view_supplier_cost', 'funding_cost'],
    ['view_booking_profit', 'profit'],
  ] as const;
  for (const [permission, field] of cases) {
    await access(u, ['operations', permission]);
    const s = await snapshot(db, u.actor),
      b = s.bookings.find((b) => b.summary === 'Visibility case')!;
    assert.ok(b[field] !== undefined);
    for (const [other, key] of cases) if (other !== permission) assert.equal(b[key], undefined);
    assert.deepEqual(s.journal, []);
    assert.deepEqual(s.movements, []);
  }
  await access(u, ['operations', 'view_total_profit']);
  const totals = await snapshot(db, u.actor);
  assert.ok(totals.movements.length);
  for (const m of totals.movements) {
    assert.equal(m.booking_id, undefined);
    assert.equal(m.code, undefined);
  }
  assert.equal(totals.bookings[0].profit, undefined);
  await access(u, ['operations', 'view_asset_basis']);
  const assets = await snapshot(db, u.actor);
  assert.ok(assets.assets.some((a) => a.remaining_basis !== undefined));
  assert.deepEqual(assets.journal, []);
  await access(u, ['operations', 'view_accounting']);
  const accounting = await snapshot(db, u.actor);
  assert.ok(accounting.journal.length);
  assert.equal(accounting.bookings[0].profit, undefined);
  assert.deepEqual(accounting.movements, []);
});
test('asset management does not imply cost-basis visibility, including lots and movement history', async () => {
  const u = await employee(['operations', 'manage_assets']);
  const s = await snapshot(db, u.actor);
  assert.ok(s.assets.length);
  const a = await detail(db, u.actor, 'asset', s.assets[0].id);
  for (const r of [a.asset, ...a.lots, ...a.movements, ...a.sales])
    for (const k of ['remaining_basis', 'basis', 'cost']) assert.equal(r[k], undefined, k);
});
test('completed booking changes need a separate grant', async () => {
  const u = await employee();
  const b = (await snapshot(db, owner)).bookings[0];
  const values = {
    booking_id: b.id,
    summary: 'Updated completed journey',
    travel_start: '2026-09-01',
    travel_end: '2026-09-02',
    reservation_status: 'Traveled',
    reason: 'Complete travel',
    date: '2026-10-28',
  };
  await cmd(owner, 'revise', values);
  await assert.rejects(
    () => cmd(u.actor, 'revise', { ...values, summary: 'Unauthorized edit' }),
    /edit_completed_bookings/,
  );
  await access(u, ['operations', 'edit_completed_bookings']);
  await cmd(u.actor, 'revise', { ...values, summary: 'Explicitly authorized edit' });
  const event = await one(
    db,
    "SELECT * FROM audit_events WHERE actor=$1 AND kind='revise' LIMIT 1",
    [u.actor.id],
  );
  assert.equal(event.actor, u.actor.id);
  assert.ok(event.created_at);
});
test('permission revocation invalidates sessions and stale material-action principals', async () => {
  const u = await employee();
  const token = u.token,
    stale = u.actor;
  await updateUser(db, owner, {
    ...u.user,
    permissions: ['operations'],
    reason: 'Revoke payment entry',
  });
  assert.equal(await sessionActor(db, token), null);
  await assert.rejects(
    () =>
      cmd(stale, 'party', {
        name: 'Stale action',
        kind: 'person',
        roles: ['customer', 'traveler', 'seller'],
      }),
    /Session no longer valid/,
  );
  const actor = (await sessionActor(
    db,
    (await login(db, { email: u.user.email, password: u.password })).token,
  ))!;
  assert.ok(!hasPermission(actor, 'edit_payments'));
});
test('deactivation preserves history, blocks login and invalidates every session and reset link', async () => {
  const u = await employee(),
    second = await login(db, { email: u.user.email, password: u.password }),
    link = await issueRecovery(db, owner, u.user.id);
  await cmd(u.actor, 'party', {
    name: 'Worker historical action',
    kind: 'person',
    roles: ['customer', 'traveler', 'seller'],
  });
  await updateUser(db, owner, { ...u.user, active: false, reason: 'Employment access ended' });
  assert.equal(await sessionActor(db, u.token), null);
  assert.equal(await sessionActor(db, second.token), null);
  await assert.rejects(
    () => login(db, { email: u.user.email, password: u.password }),
    /Invalid email/,
  );
  await assert.rejects(
    () =>
      completeRecovery(db, { token: link.token, password: 'New synthetic password long enough' }),
    /Invalid or expired/,
  );
  assert.ok(
    Number(
      (await one(db, 'SELECT count(*) count FROM audit_events WHERE actor=$1', [u.actor.id])).count,
    ) > 0,
  );
  assert.equal((await one(db, 'SELECT active FROM staff WHERE id=$1', [u.actor.id])).active, false);
});
test('employee cannot self-promote, edit users, or obtain another user recovery credential', async () => {
  const u = await employee();
  await assert.rejects(() => listUsers(db, u.actor), /manage_users/);
  await assert.rejects(
    () =>
      createUser(db, u.actor, {
        name: 'Escalation',
        email: 'escalate@example.invalid',
        role: 'OWNER',
      }),
    /manage_users/,
  );
  await assert.rejects(() => issueRecovery(db, u.actor, ownerID), /manage_users/);
  await access(u, ['operations', 'manage_users']);
  await assert.rejects(
    () => updateUser(db, u.actor, { ...u.user, role: 'OWNER', reason: 'Attempt promotion' }),
    /Only an Owner/,
  );
  await assert.rejects(
    () =>
      createUser(db, u.actor, {
        name: 'Higher grants',
        email: 'higher@example.invalid',
        permissions: ['operations', 'view_accounting'],
      }),
    /beyond your own/,
  );
});
test('last active Owner is protected from deactivation and demotion', async () => {
  const o = await one(db, 'SELECT id,email,name,role,permissions,active FROM staff WHERE id=$1', [
    ownerID,
  ]);
  await assert.rejects(
    () => updateUser(db, owner, { ...o, active: false, reason: 'Deactivate last owner' }),
    /last active Owner/,
  );
  await assert.rejects(
    () => updateUser(db, owner, { ...o, role: 'EMPLOYEE', reason: 'Demote last owner' }),
    /last active Owner/,
  );
});
test('recovery requests are enumeration-safe; links are hashed, expiring, single-use and revoke all sessions', async () => {
  const u = await employee(),
    known = await requestRecovery(db, { email: u.user.email }),
    unknown = await requestRecovery(db, { email: 'unknown@example.invalid' });
  assert.deepEqual(known, unknown);
  assert.match(known.message, /reset link|inbox/i);
  assert.ok((await listUsers(db, owner)).recoveryRequests.some((r) => r.staff_id === u.actor.id));
  // Self-serve request already minted a single-use token; Owner re-issue still works.
  const link = await issueRecovery(db, owner, u.actor.id);
  const stored = await one(db, 'SELECT * FROM password_reset_tokens WHERE token_hash=$1', [
    tokenHash(link.token),
  ]);
  assert.notEqual(stored.token_hash, link.token);
  assert.equal(stored.used_at, null);
  const history = await db.query('SELECT * FROM security_audit');
  assert.ok(!JSON.stringify(history.rows).includes(link.token));
  const next = 'Replacement synthetic password only';
  await completeRecovery(db, { token: link.token, password: next });
  assert.equal(await sessionActor(db, u.token), null);
  await assert.rejects(
    () => completeRecovery(db, { token: link.token, password: next }),
    /Invalid or expired/,
  );
  await assert.rejects(
    () => login(db, { email: u.user.email, password: u.password }),
    /Invalid email/,
  );
  await login(db, { email: u.user.email, password: next });
  const expired = await issueRecovery(db, owner, u.actor.id);
  await db.query(
    "UPDATE password_reset_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
    [tokenHash(expired.token)],
  );
  await assert.rejects(
    () => completeRecovery(db, { token: expired.token, password: next }),
    /Invalid or expired/,
  );
});
test('concurrent reset attempts can consume a link only once', async () => {
  const u = await employee(),
    link = await issueRecovery(db, owner, u.actor.id);
  const result = await Promise.allSettled([
    completeRecovery(db, { token: link.token, password: 'First synthetic replacement password' }),
    completeRecovery(db, { token: link.token, password: 'Second synthetic replacement password' }),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
});
test('password changes require current password and revoke other sessions; login throttling is persistent', async () => {
  const u = await employee();
  await assert.rejects(
    () =>
      changePassword(db, u.actor, {
        current_password: 'wrong',
        password: 'New synthetic password only',
      }),
    /incorrect/,
  );
  await changePassword(db, u.actor, {
    current_password: u.password,
    password: 'New synthetic password only',
  });
  assert.equal(await sessionActor(db, u.token), null);
  await login(db, { email: u.user.email, password: 'New synthetic password only' });
  const throttle = await employee();
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => login(db, { email: throttle.user.email, password: 'wrong' }),
      /Invalid email/,
    );
  await assert.rejects(
    () => login(db, { email: throttle.user.email, password: throttle.password }),
    /Too many attempts/,
  );
  assert.equal(
    Number(
      (
        await one(db, 'SELECT attempts FROM auth_throttles WHERE bucket_hash=$1', [
          tokenHash(`login:${throttle.user.email}`),
        ])
      ).attempts,
    ),
    6,
  );
  const recovery = await issueRecovery(db, owner, throttle.user.id);
  await completeRecovery(db, {
    token: recovery.token,
    password: 'Recovered after failed attempts password',
  });
  await login(db, {
    email: throttle.user.email,
    password: 'Recovered after failed attempts password',
  });
});
test('security audit has actual actors, immutable history, and no password/token material', async () => {
  const events = (await listUsers(db, owner)).audit;
  assert.ok(events.some((e) => e.actor_id === ownerID && e.action === 'user_access_updated'));
  assert.ok(events.some((e) => e.action === 'password_reset'));
  assert.ok(events.every((e) => e.created_at));
  assert.ok(!JSON.stringify(events).includes(ownerPassword));
  await assert.rejects(() => db.query('DELETE FROM security_audit'), /immutable/);
});
test('personal recovery codes require password verification, are stored hashed, and work once per individual', async () => {
  const u = await employee();
  await assert.rejects(
    () => regeneratePersonalCodes(db, u.actor, { current_password: 'wrong' }),
    /incorrect/,
  );
  const issued = await regeneratePersonalCodes(db, u.actor, { current_password: u.password });
  assert.equal(issued.recovery_codes!.length, 8);
  const raw = issued.recovery_codes![0];
  assert.ok(
    !(await db.query('SELECT * FROM personal_recovery_codes')).rows.some((r) =>
      JSON.stringify(r).includes(raw),
    ),
  );
  await assert.rejects(
    () =>
      recoverWithPersonalCode(db, {
        email: 'owner@example.invalid',
        code: raw,
        password: 'Attempt another user recovery',
      }),
    /Invalid recovery/,
  );
  const reset = await recoverWithPersonalCode(db, {
    email: u.user.email,
    code: raw,
    password: 'Recovered synthetic worker password',
  });
  assert.equal(reset.recovery_codes!.length, 8);
  assert.equal(await sessionActor(db, u.token), null);
  await assert.rejects(
    () =>
      recoverWithPersonalCode(db, {
        email: u.user.email,
        code: raw,
        password: 'Attempt replay old personal code',
      }),
    /Invalid recovery/,
  );
  await login(db, { email: u.user.email, password: 'Recovered synthetic worker password' });
});
test('a sole Owner can recover with an individual offline code without another signed-in administrator', async () => {
  const recovered = await recoverWithPersonalCode(db, {
    email: 'owner@example.invalid',
    code: ownerCodes[0],
    password: 'Recovered sole synthetic Owner password',
  });
  assert.equal(recovered.recovery_codes!.length, 8);
  const session = await login(db, {
    email: 'owner@example.invalid',
    password: 'Recovered sole synthetic Owner password',
  });
  const actor = (await sessionActor(db, session.token))!;
  assert.equal(actor.id, ownerID);
  assert.equal(actor.role, 'OWNER');
  assert.ok(hasPermission(actor, 'manage_users'));
});
