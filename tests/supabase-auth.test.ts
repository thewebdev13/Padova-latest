import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existingFixture } from './padova-fixture';
import {
  bootstrapOwner,
  createUser,
  login,
  sessionActor,
  updateUser,
  issueRecovery,
  completeRecovery,
  recoverWithPersonalCode,
  changePassword,
  logout,
} from '../src/lib/users';
import { OWNER_PERMISSIONS, EMPLOYEE_PERMISSIONS } from '../src/lib/permissions';
import {
  supabaseAuth,
  AuthProviderError,
  type AuthProvider,
  type AuthSession,
  type AuthIdentity,
} from '../src/lib/supabase-auth';
import { snapshot } from '../src/lib/queries';
import { tokenHash } from '../src/lib/credentials';

process.env.PADOVA_AUTH_ENCRYPTION_KEY = randomBytes(32).toString('base64');
function fakeProvider() {
  const ids = new Map(
    ['owner@example.invalid', 'worker@example.invalid'].map((email) => [email, randomUUID()]),
  );
  const users = new Map<string, any>(),
    sessions = new Map<string, AuthSession>();
  let resetFailure = false;
  const session = (u: any) => {
    const s = {
      user: {
        id: u.id,
        email: u.email,
        email_confirmed_at: u.confirmed ? '2026-10-28T00:00:00Z' : null,
        updated_at: u.updated_at,
      },
      access_token: randomBytes(24).toString('hex'),
      refresh_token: randomBytes(24).toString('hex'),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    sessions.set(s.access_token, s);
    return s;
  };
  const provider: AuthProvider = {
    create: async (email, password, confirmed) => {
      const id = ids.get(email);
      if (!id || users.has(id)) throw new Error('duplicate');
      const u = { id, email, password, confirmed };
      users.set(id, u);
      return u;
    },
    signIn: async (email, password) => {
      const u = [...users.values()].find(
        (u) => u.email === email && u.password === password && u.confirmed,
      );
      if (!u) throw new AuthProviderError(401);
      u.updated_at = new Date(Date.now() + sessions.size * 1000).toISOString();
      return session(u);
    },
    user: async (token) => {
      const s = sessions.get(token);
      if (!s) throw new Error('invalid');
      return { ...s.user, updated_at: users.get(s.user.id)?.updated_at };
    },
    signOut: async (token) => {
      sessions.delete(token);
    },
    refresh: async (token) => {
      const s = [...sessions.values()].find((s) => s.refresh_token === token);
      if (!s) throw new Error('invalid');
      sessions.delete(s.access_token);
      return session(users.get(s.user.id));
    },
    update: async (id, v) => {
      if (resetFailure) throw new Error('provider offline');
      const u = users.get(id);
      if (!u) throw new Error('not found');
      if (v.password) u.password = v.password;
      if (v.email) u.email = v.email;
      if (v.email_confirm) u.confirmed = true;
    },
  };
  return {
    provider,
    ids,
    failReset: (value: boolean) => {
      resetFailure = value;
    },
  };
}
async function setup() {
  const mock = fakeProvider(),
    { raw, db } = await existingFixture(mock.provider);
  for (const [email, id] of mock.ids)
    await raw.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, email]);
  const password = 'Synthetic-provider-password-2026';
  const owner = await bootstrapOwner(db, {
    email: 'owner@example.invalid',
    name: 'Personal Owner',
    password,
  });
  const actor = {
    id: owner.id,
    name: owner.name,
    role: 'OWNER' as const,
    permissions: OWNER_PERMISSIONS,
    authVersion: 1,
  };
  return { ...mock, raw, db, password, owner, actor };
}
test('same individual keeps concurrent sessions through metadata updates, local logout and explicit global security revocation', async () => {
  const { db, owner, password, actor } = await setup();
  try {
    const a = await login(db, { email: owner.email, password });
    const b = await login(db, { email: owner.email, password });
    assert.ok(await sessionActor(db, a.token));
    assert.ok(await sessionActor(db, b.token));
    await logout(db, b.token);
    assert.equal(await sessionActor(db, b.token), null);
    assert.ok(await sessionActor(db, a.token));
    await changePassword(db, actor, {
      current_password: password,
      password: 'New-personal-password-2026',
    });
    assert.equal(await sessionActor(db, a.token), null);
  } finally {
    await db.close();
  }
});

test('Supabase identities, encrypted app sessions, fresh permissions, setup and deactivation', async () => {
  const { raw, db, password, owner, actor } = await setup();
  try {
    const session = await login(db, { email: 'owner@example.invalid', password });
    assert.equal((await sessionActor(db, session.token))?.id, owner.id);
    const saved = (await raw.query('SELECT provider_state FROM padova.web_sessions')).rows[0]
      .provider_state;
    assert.ok(!saved.includes('access_token'));
    assert.ok(!saved.includes(password));
    assert.equal(
      (
        await raw.query(
          "SELECT count(*)::integer AS n FROM information_schema.columns c JOIN pg_tables t ON t.schemaname=c.table_schema AND t.tablename=c.table_name WHERE table_schema='padova' AND column_name='password_hash'",
        )
      ).rows[0].n,
      0,
    );
    const employee = await createUser(db, actor, {
      email: 'worker@example.invalid',
      name: 'Personal Worker',
    });
    assert.equal(
      employee.id,
      (await raw.query("SELECT user_id FROM padova.staff WHERE app_email='worker@example.invalid'"))
        .rows[0].user_id,
    );
    await assert.rejects(login(db, { email: employee.email, password }));
    const reset = await issueRecovery(db, actor, employee.id);
    const recovered = await completeRecovery(db, { token: reset.token, password });
    assert.equal(recovered.recovery_codes!.length, 8);
    await assert.rejects(completeRecovery(db, { token: reset.token, password }));
    const workerSession = await login(db, { email: employee.email, password });
    const worker = (await sessionActor(db, workerSession.token))!;
    assert.deepEqual(worker.permissions, EMPLOYEE_PERMISSIONS);
    await assert.rejects(
      createUser(db, worker, { email: 'owner2@example.invalid', name: 'No escalation' }),
    );
    const data = await snapshot(db, worker);
    assert.equal(data.movements.length, 0);
    assert.equal(data.assets.length, 0);
    await updateUser(db, actor, {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: 'EMPLOYEE',
      permissions: EMPLOYEE_PERMISSIONS,
      active: false,
      reason: 'Access ended',
    });
    assert.equal(await sessionActor(db, workerSession.token), null);
    await assert.rejects(login(db, { email: employee.email, password }));
    await assert.rejects(
      updateUser(db, actor, {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        role: 'EMPLOYEE',
        permissions: [],
        active: false,
        reason: 'Last Owner test',
      }),
    );
    await logout(db, session.token);
    assert.equal(await sessionActor(db, session.token), null);
  } finally {
    await db.close();
  }
});
test('provider recovery consumes proof before external writes and supports sole-Owner codes', async () => {
  const { db, raw, actor, owner, password, failReset } = await setup();
  try {
    const old = await login(db, { email: owner.email, password });
    failReset(true);
    await assert.rejects(
      recoverWithPersonalCode(db, {
        email: owner.email,
        code: owner.recovery_codes[0],
        password: 'Changed-provider-password-2026',
      }),
      /Provider reset failed/,
    );
    failReset(false);
    assert.equal(await sessionActor(db, old.token), null);
    await assert.rejects(
      recoverWithPersonalCode(db, { email: owner.email, code: owner.recovery_codes[0], password }),
    );
    const result = await recoverWithPersonalCode(db, {
      email: owner.email,
      code: owner.recovery_codes[1],
      password: 'Changed-provider-password-2026',
    });
    assert.equal(result.recovery_codes!.length, 8);
    const current = await login(db, {
      email: owner.email,
      password: 'Changed-provider-password-2026',
    });
    const principal = (await sessionActor(db, current.token))!;
    await changePassword(db, principal, {
      current_password: 'Changed-provider-password-2026',
      password: 'Final-provider-password-2026',
    });
    assert.equal(await sessionActor(db, current.token), null);
    const audit = (
      await raw.query('SELECT after_value::text AS text FROM padova.security_audit')
    ).rows
      .map((x) => x.text)
      .join('');
    assert.ok(!audit.includes('Final-provider-password'));
    assert.ok(!audit.includes(owner.recovery_codes[0]));
  } finally {
    await db.close();
  }
});
test('REST provider pins the US host and verifies sessions with the provider user endpoint', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const id = randomUUID();
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify(
        String(url).includes('/user')
          ? { id, email_confirmed_at: 'verified' }
          : {
              user: { id, email_confirmed_at: 'verified' },
              access_token: 'access',
              refresh_token: 'refresh',
              expires_in: 3600,
            },
      ),
      { status: 200 },
    );
  };
  const provider = supabaseAuth(fakeFetch, {
    SUPABASE_PUBLISHABLE_KEY: 'public-test',
    SUPABASE_SECRET_KEY: 'private-test',
  });
  const session = await provider.signIn('person@example.invalid', 'only-test-password');
  assert.equal((await provider.user(session.access_token)).id, id);
  assert.ok(
    calls.every((x) => x.url.startsWith('https://unugynfzmxjxifgofxjr.supabase.co/auth/v1/')),
  );
  assert.equal((calls[1].init!.headers as Record<string, string>).Authorization, 'Bearer access');
  assert.throws(() =>
    supabaseAuth(fakeFetch, { SUPABASE_URL: 'https://qqnybbtruvkrstziswsi.supabase.co' }),
  );
});
