import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabase, migrate } from '../src/lib/db';
import { bootstrapOwner, createUser, issueRecovery, completeRecovery } from '../src/lib/users';
import { execute } from '../src/lib/finance';
import { OWNER_PERMISSIONS, EMPLOYEE_PERMISSIONS } from '../src/lib/permissions';
// Isolated synthetic database. Never run HTTP acceptance against production.
process.env.DATABASE_URL = '';
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.join(process.cwd(), '.data', `http-test-${randomUUID()}`);
const db = await createDatabase(),
  password = randomBytes(24).toString('base64url');
const ownerPassword = randomBytes(24).toString('base64url');
let ownerUser: any, employeeUser: any, booking: any, asset: any, customer: any;
try {
  await migrate(db);
  ownerUser = await bootstrapOwner(db, {
    name: 'Synthetic HTTP Owner',
    email: 'owner@example.invalid',
    password: ownerPassword,
  });
  const actor = {
    id: ownerUser.id,
    name: ownerUser.name,
    role: 'OWNER' as const,
    permissions: OWNER_PERMISSIONS,
  };
  employeeUser = await createUser(db, actor, {
    name: 'Synthetic test operator',
    email: 'synthetic@example.invalid',
    permissions: EMPLOYEE_PERMISSIONS,
  });
  const link = await issueRecovery(db, actor, employeeUser.id);
  await completeRecovery(db, { token: link.token, password });
  const command = (kind: any, data: any) => execute(db, actor, { id: randomUUID(), kind, data });
  customer = await command('party', { name: 'HTTP customer', kind: 'person', roles: ['customer'] });
  await command('party', { name: 'HTTP neutral profile contact', kind: 'person', roles: [] });
  const supplier = await command('party', {
    name: 'HTTP supplier',
    kind: 'supplier',
    roles: ['seller', 'airline'],
  });
  booking = await command('booking', {
    customer_id: customer.id,
    supplier_id: supplier.id,
    product: 'Flight',
    channel: 'Direct',
    summary: 'HTTP protected financial booking',
    booked_on: '2026-10-28',
    travel_start: '2027-01-01',
    travel_end: '2027-01-02',
    sale: 128987,
  });
  await command('fund', {
    booking_id: booking.id,
    kind: 'Card',
    face_amount: 73545,
    date: '2026-10-28',
  });
  asset = await command('acquire_asset', {
    name: 'HTTP protected asset',
    kind: 'Voucher',
    issuer: 'Test',
    quantity: 100000,
    cost: 79661,
    date: '2026-10-28',
  });
} finally {
  await db.close();
}
const port = await new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    if (!a || typeof a === 'string') return reject(new Error('Port allocation failed'));
    s.close(() => resolve(a.port));
  });
});
const require = createRequire(import.meta.url),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    process.env.PADOVA_HTTP_BUILD_DIR ?? process.cwd(),
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    env: { ...process.env, PADOVA_LOCAL_DEMO: 'true', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout.resume();
server.stderr.resume();
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('HTTP test server exited before readiness');
    try {
      const r = await fetch(`${origin}/api/state`);
      if (r.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Server readiness');
  assert.equal((await fetch(`${origin}/api/state`)).status, 401, 'Unauthenticated reads rejected');
  assert.equal(
    (await fetch(`${origin}/api/directory?q=HTTP`)).status,
    401,
    'Unauthenticated directory search rejected',
  );
  const post = (url: string, data: unknown, cookie?: string, withOrigin = true) =>
    fetch(origin + url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(withOrigin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(data),
    });
  assert.equal(
    (await post('/api/auth', { email: 'synthetic@example.invalid', password }, undefined, false))
      .status,
    400,
    'CSRF protection',
  );
  assert.equal(
    (await post('/api/auth', { email: 'synthetic@example.invalid', password: 'wrong' })).status,
    401,
    'Wrong password',
  );
  const login = await post('/api/auth', { email: 'synthetic@example.invalid', password });
  assert.equal(login.status, 200, 'Login');
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.ok(login.headers.get('set-cookie')!.includes('HttpOnly'));
  const state = await (await fetch(`${origin}/api/state`, { headers: { Cookie: cookie } })).json();
  assert.equal(state.actor.name, 'Synthetic test operator');
  assert.equal(state.localDemo, false);
  assert.equal(state.journal.length, 0);
  assert.equal(
    (await post('/api/commands', { id: randomUUID(), kind: 'acquire_asset', data: {} }, cookie))
      .status,
    403,
    'Financial write permission',
  );
  const data = {
    id: randomUUID(),
    kind: 'party',
    data: { name: 'HTTP synthetic customer', kind: 'person' },
  };
  const saved = await post('/api/commands', data, cookie);
  assert.equal(saved.status, 200, 'Authenticated operational write');
  const first = await saved.json(),
    second = await (await post('/api/commands', data, cookie)).json();
  assert.equal(first.result.id, second.result.id, 'Idempotent API retry');
  assert.equal(
    (await post('/api/commands', { ...data, id: randomUUID() }, cookie, false)).status,
    400,
    'Command CSRF protection',
  );
  // Exercise administration, disclosure boundaries, recovery and deactivation through HTTP.
  const get = (path: string, cookie: string) =>
    fetch(origin + path, { headers: { Cookie: cookie } });
  const directory = await (await get('/api/directory?q=HTTP', cookie)).json();
  assert.ok(directory.results.some((p: any) => p.name === 'HTTP customer'));
  assert.ok(directory.results.length <= 30);
  assert.ok(
    directory.results.every(
      (p: any) =>
        Object.keys(p).every((k) => ['id', 'name', 'kind', 'roles'].includes(k)) &&
        JSON.stringify(p.roles) === JSON.stringify(['customer']),
    ),
    'Search returns safe identity labels only',
  );
  const signIn = async (email: string, password: string) => {
    const r = await post('/api/auth', { email, password });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie')!.split(';')[0];
  };
  const ownerCookie = await signIn('owner@example.invalid', ownerPassword);
  const contactDirectory = await (
    await get('/api/directory?role=contact&q=HTTP', ownerCookie)
  ).json();
  assert.ok(contactDirectory.results.some((p: any) => p.name === 'HTTP neutral profile contact'));
  assert.ok(
    contactDirectory.results.every((p: any) => p.kind === 'person' && p.roles.length === 0),
  );
  assert.ok(!contactDirectory.results.some((p: any) => p.id === booking.supplier_id));
  const airlineDirectory = await (
    await get('/api/directory?role=airline&q=HTTP', ownerCookie)
  ).json();
  assert.ok(airlineDirectory.results.some((p: any) => p.id === booking.supplier_id));
  assert.ok(
    airlineDirectory.results.every(
      (p: any) => JSON.stringify(p.roles) === JSON.stringify(['airline']),
    ),
    'Directory discloses only requested eligibility',
  );
  const forgedProvider = await post(
    '/api/commands',
    {
      id: randomUUID(),
      kind: 'booking',
      data: {
        customer_id: customer.id,
        product: 'Flight',
        channel: 'GDS',
        summary: 'Rejected forged airline',
        booked_on: '2026-10-30',
        travel_start: '2027-01-01',
        travel_end: '2027-01-02',
        travel_components_input: [
          {
            product: 'Flight',
            summary: 'Rejected forged airline',
            provider_id: customer.id,
            travel_start: '2027-01-01',
            travel_end: '2027-01-02',
          },
        ],
      },
    },
    ownerCookie,
  );
  assert.equal(forgedProvider.status, 400, 'Forged provider ID rejected over HTTP');
  const ownerState = await (await get('/api/state', ownerCookie)).json();
  assert.match(ownerState.revision, /^[a-f0-9]{64}$/);
  const revisionResponse = await get('/api/state?revision=1', ownerCookie);
  assert.match(revisionResponse.headers.get('cache-control') ?? '', /no-store/);
  const revisionBody = await revisionResponse.text();
  assert.ok(Buffer.byteLength(revisionBody) < 100, 'Idle poll must not download state');
  assert.equal(JSON.parse(revisionBody).revision, ownerState.revision);
  assert.equal((await fetch(`${origin}/api/state?revision=1`)).status, 401);
  assert.equal((await fetch(`${origin}/api/state?historical=1`)).status, 401);
  assert.equal(ownerState.bookings[0].sale, 128987);
  assert.equal(ownerState.bookings[0].funding_cost, 73545);
  const operationalEntry = {
    customer_id: customer.id,
    product: 'Flight',
    channel: 'GDS',
    summary: 'HTTP Employee operational entry',
    booked_on: '2026-10-30',
    travel_start: '2027-02-01',
    travel_end: '2027-02-01',
    travel_components_input: [
      {
        product: 'Flight',
        summary: 'HTTP Employee operational entry',
        travel_start: '2027-02-01',
        travel_end: '2027-02-01',
        details: { trip_type: 'One Way', end_date_known: false },
      },
    ],
    operational: { version: 1, sale_known: false, components: [] },
  };
  for (const taxes of [
    { amount: 3000, bearer: 'Padova', method: 'Cash' },
    { amount: 3000, bearer: 'Seller', owed_to_seller: true, seller_id: randomUUID() },
  ]) {
    const rejected = await post(
      '/api/commands',
      {
        id: randomUUID(),
        kind: 'booking',
        data: { ...operationalEntry, operational: { ...operationalEntry.operational, taxes } },
      },
      cookie,
    );
    assert.equal(rejected.status, 403, 'Employee tax funding rejected over HTTP');
  }
  const employeeBooking = await post(
    '/api/commands',
    {
      id: randomUUID(),
      kind: 'booking',
      data: operationalEntry,
    },
    cookie,
  );
  assert.equal(
    employeeBooking.status,
    200,
    `Employee can save an operational booking without funding: ${await employeeBooking.text()}`,
  );
  for (const field of ['sale', 'funding_cost', 'profit', 'gross_profit', 'customer_balance'])
    assert.equal(state.bookings[0][field], undefined, field);
  assert.equal((await get('/api/users', cookie)).status, 403);
  assert.equal(
    (
      await post(
        '/api/users',
        { action: 'update', ...employeeUser, role: 'OWNER', reason: 'Attempt self promotion' },
        cookie,
      )
    ).status,
    403,
  );
  const admin = await (await get('/api/users', ownerCookie)).json();
  assert.equal(admin.users.length, 2);
  assert.ok(!JSON.stringify(admin).includes('password_hash'));
  assert.ok(!JSON.stringify(admin).includes('token_hash'));
  const grant = async (permissions: string[], active = true) => {
    const r = await post(
      '/api/users',
      {
        action: 'update',
        ...employeeUser,
        permissions,
        active,
        reason: 'HTTP acceptance permission update',
      },
      ownerCookie,
    );
    assert.equal(r.status, 200);
  };
  await grant(['operations', 'edit_payments', 'manage_assets']);
  assert.equal(
    (await get('/api/state', cookie)).status,
    401,
    'Permission update revokes old session',
  );
  let workerCookie = await signIn('synthetic@example.invalid', password);
  const managed = await (await get('/api/state?type=asset&id=' + asset.id, workerCookie)).json();
  assert.equal(managed.asset.remaining_basis, undefined);
  assert.equal(managed.lots[0].cost, undefined);
  assert.equal(managed.movements[0].basis, undefined);
  const sale = await post(
    '/api/commands',
    {
      id: randomUUID(),
      kind: 'sell_asset',
      data: {
        asset_id: asset.id,
        buyer_id: customer.id,
        quantity: 10000,
        proceeds: 9000,
        date: '2026-10-28',
      },
    },
    workerCookie,
  );
  assert.equal(sale.status, 200);
  const saleResult = await sale.json();
  assert.deepEqual(Object.keys(saleResult.result), ['id'], 'No derived basis in command response');
  await grant(['operations', 'edit_payments', 'view_booking_profit']);
  assert.equal((await get('/api/state', workerCookie)).status, 401);
  workerCookie = await signIn('synthetic@example.invalid', password);
  const profitOnly = await (await get('/api/state', workerCookie)).json();
  assert.equal(profitOnly.bookings[0].profit, 55442);
  assert.equal(profitOnly.bookings[0].sale, undefined);
  assert.equal(profitOnly.bookings[0].funding_cost, undefined);
  assert.deepEqual(profitOnly.movements, []);
  assert.deepEqual(profitOnly.journal, []);
  const recoveryKnown = await (
      await post('/api/auth/recovery', { action: 'request', email: 'synthetic@example.invalid' })
    ).json(),
    recoveryUnknown = await (
      await post('/api/auth/recovery', { action: 'request', email: 'absent@example.invalid' })
    ).json();
  assert.deepEqual(recoveryKnown, recoveryUnknown);
  const resetLink = await (
    await post('/api/users', { action: 'recovery', id: employeeUser.id }, ownerCookie)
  ).json();
  assert.equal(resetLink.token.length, 64);
  const nextPassword = randomBytes(24).toString('base64url');
  const resetResponse = await post(
    '/api/auth/recovery',
    { action: 'reset', token: resetLink.token, password: nextPassword },
    workerCookie,
  );
  assert.equal(resetResponse.status, 200);
  const recoveryResult = await resetResponse.json();
  assert.equal(recoveryResult.recovery_codes.length, 8);
  assert.equal((await get('/api/state', workerCookie)).status, 401);
  assert.equal(
    (
      await post('/api/auth/recovery', {
        action: 'reset',
        token: resetLink.token,
        password: nextPassword,
      })
    ).status,
    400,
    'Reset replay rejected',
  );
  workerCookie = await signIn('synthetic@example.invalid', nextPassword);
  const personalReset = await post(
    '/api/auth/recovery',
    {
      action: 'backup_code',
      email: 'synthetic@example.invalid',
      code: recoveryResult.recovery_codes[0],
      password: nextPassword,
    },
    workerCookie,
  );
  assert.equal(personalReset.status, 200, 'Personal recovery-code endpoint');
  assert.equal((await personalReset.json()).recovery_codes.length, 8);
  assert.equal((await get('/api/state', workerCookie)).status, 401);
  assert.equal(
    (
      await post('/api/auth/recovery', {
        action: 'backup_code',
        email: 'synthetic@example.invalid',
        code: recoveryResult.recovery_codes[0],
        password: nextPassword,
      })
    ).status,
    400,
    'Personal code replay rejected',
  );
  workerCookie = await signIn('synthetic@example.invalid', nextPassword);

  const payment = await post(
    '/api/commands',
    {
      id: randomUUID(),
      kind: 'payment',
      data: {
        party_id: customer.id,
        direction: 'customer',
        amount: 10000,
        date: '2026-10-28',
        method: 'ACH',
        allocations: [{ booking_id: booking.id, amount: 10000 }],
      },
    },
    workerCookie,
  );
  assert.equal(payment.status, 200);
  const timeline = await (
    await get('/api/state?type=booking&id=' + booking.id, ownerCookie)
  ).json();
  assert.ok(
    timeline.activity.some(
      (e: any) => e.kind === 'payment' && e.actor === employeeUser.id && e.created_at,
    ),
    'Material action attributed to actual staff UUID',
  );
  const beforeDeactivationLink = await (
    await post('/api/users', { action: 'recovery', id: employeeUser.id }, ownerCookie)
  ).json();
  await grant(['operations', 'edit_payments'], false);
  assert.equal((await get('/api/state', workerCookie)).status, 401);
  assert.equal(
    (await post('/api/auth', { email: 'synthetic@example.invalid', password: nextPassword }))
      .status,
    401,
  );
  assert.equal(
    (
      await post('/api/auth/recovery', {
        action: 'reset',
        token: beforeDeactivationLink.token,
        password: nextPassword,
      })
    ).status,
    400,
    'Deactivated user cannot recover',
  );
  assert.equal(
    (
      await post(
        '/api/users',
        {
          action: 'update',
          ...ownerUser,
          active: false,
          reason: 'Attempt last owner deactivation',
        },
        ownerCookie,
      )
    ).status,
    403,
  );
  const finalAdmin = await (await get('/api/users', ownerCookie)).json();
  assert.ok(
    finalAdmin.audit.some(
      (e: any) => e.action === 'user_deactivated' && e.actor_id === ownerUser.id,
    ),
  );
  const logoutCookie = ownerCookie;
  const logout = await fetch(`${origin}/api/auth`, {
    method: 'DELETE',
    headers: { Origin: origin, Cookie: logoutCookie },
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(`${origin}/api/state`, { headers: { Cookie: logoutCookie } })).status,
    401,
    'Session revocation',
  );
  console.log(
    'HTTP acceptance passed: individual authentication, no legacy bypass, granular response filtering, owner administration, permissions, session revocation, recovery/replay rejection, deactivation, actual-user audit, CSRF and idempotency.',
  );
} finally {
  server.kill();
}
