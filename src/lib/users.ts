import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Database, SQL, Row, one } from './db';
import { hashPassword, verifyPassword, tokenHash } from './credentials';
import {
  openSession,
  sealSession,
  AuthProviderError,
  requireSessionEncryption,
} from './supabase-auth';
import { hostedRecovery, hostedPasswordChange } from './supabase-recovery';
import {
  Actor,
  PERMISSIONS,
  Permission,
  OWNER_PERMISSIONS,
  EMPLOYEE_PERMISSIONS,
  effectivePermissions,
  requirePermission,
} from './permissions';

export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
const uuid = z.string().uuid(),
  email = z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((s) => s.toLowerCase());
const passwordSchema = z.string().min(14, 'Use at least 14 characters').max(500);
const permissionSchema = z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]]);
const userSchema = z.object({
  email,
  name: z.string().trim().min(1).max(120),
  role: z.enum(['OWNER', 'EMPLOYEE']).default('EMPLOYEE'),
  permissions: z.array(permissionSchema).max(50).default(EMPLOYEE_PERMISSIONS),
  active: z.boolean().default(true),
});
const dummyHash = hashPassword('non-user-password-hash-for-timing-only');
export async function newPersonalCodes(tx: SQL, staff_id: string) {
  await tx.query(
    'UPDATE personal_recovery_codes SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
    [staff_id],
  );
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const raw = randomBytes(16).toString('hex');
    await tx.query('INSERT INTO personal_recovery_codes(code_hash,staff_id) VALUES($1,$2)', [
      tokenHash(`${staff_id}:${raw}`),
      staff_id,
    ]);
    codes.push(raw.match(/.{1,8}/g)!.join('-'));
  }
  return codes;
}
export async function clearLoginThrottle(tx: SQL, email: string) {
  await tx.query('DELETE FROM auth_throttles WHERE bucket_hash=$1', [
    tokenHash(`login:${email.trim().toLowerCase()}`),
  ]);
}
function publicUser(row: Row) {
  const { password_hash, ...user } = row;
  return user;
}
export async function securityEvent(
  tx: SQL,
  actor: Actor | null,
  action: string,
  target_id: string | null,
  after: Row = {},
  before: Row | null = null,
) {
  await tx.query(
    'INSERT INTO security_audit(actor_id,actor_name,target_id,action,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6)',
    [
      actor?.id ?? null,
      actor?.name ?? 'Unauthenticated request',
      target_id,
      action,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
    ],
  );
}
export async function freshActor(tx: SQL, actor: Actor): Promise<Actor> {
  // Non-UUID principals are explicit offline synthetic fixtures, never accepted by HTTP authentication.
  if (!uuid.safeParse(actor.id).success) {
    if (tx.storage === 'padova') throw new AccessError('Real Auth identity required', 401);
    return actor;
  }
  const result = await tx.query(
    'SELECT id,name,permissions,role,auth_version FROM staff WHERE id=$1 AND active=true',
    [actor.id],
  );
  if (
    !result.rows[0] ||
    (actor.authVersion !== undefined && Number(result.rows[0].auth_version) !== actor.authVersion)
  )
    throw new AccessError('Session no longer valid', 401);
  const r = result.rows[0];
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    permissions: r.permissions,
    authVersion: Number(r.auth_version),
  };
}
export async function sessionActor(db: SQL, token: string): Promise<Actor | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  if (db.storage === 'padova' && (db as Database).transaction)
    return (db as Database).transaction((tx) => sessionActor(tx, token));
  const r = (
    await db.query(
      `SELECT s.id,s.name,s.role,s.permissions,s.auth_version${db.storage === 'padova' ? ',x.provider_state' : ''} FROM staff s JOIN sessions x ON x.staff_id=s.id WHERE x.token_hash=$1 AND x.expires_at>now() AND x.auth_version=s.auth_version AND s.active=true${db.storage === 'padova' ? ' FOR UPDATE OF x' : ''}`,
      [tokenHash(token)],
    )
  ).rows[0];
  if (r && db.storage === 'padova') {
    if (!db.authProvider || !r.provider_state) return null;
    try {
      let providerSession = openSession(r.provider_state);
      if (providerSession.expires_at < Math.floor(Date.now() / 1000) + 30) {
        providerSession = await db.authProvider.refresh(providerSession.refresh_token);
        await db.query('UPDATE sessions SET provider_state=$2 WHERE token_hash=$1', [
          tokenHash(token),
          sealSession(providerSession),
        ]);
      }
      const identity = await db.authProvider.user(providerSession.access_token);
      if (
        identity.id !== r.id ||
        !identity.email_confirmed_at ||
        (identity.banned_until && new Date(identity.banned_until).getTime() > Date.now())
      )
        return null;
    } catch {
      return null;
    }
  }
  return r
    ? {
        id: r.id,
        name: r.name,
        role: r.role,
        permissions: effectivePermissions(r as Actor),
        authVersion: Number(r.auth_version),
      }
    : null;
}
export async function attempt(tx: SQL, bucket: string, limit: number) {
  const row = await one(
    tx,
    `INSERT INTO auth_throttles(bucket_hash,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=CASE WHEN auth_throttles.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_throttles.attempts+1 END,window_start=CASE WHEN auth_throttles.window_start<now()-interval '15 minutes' THEN now() ELSE auth_throttles.window_start END RETURNING attempts`,
    [tokenHash(bucket)],
  );
  await tx.query("DELETE FROM auth_throttles WHERE window_start<now()-interval '2 days'");
  return Number(row.attempts) <= limit;
}
export async function login(db: Database, input: unknown) {
  const data = z.object({ email, password: z.string().max(500) }).parse(input);
  if (db.storage === 'padova')
    try {
      requireSessionEncryption();
    } catch {
      throw new AccessError('Configure the private session-encryption key before sign-in', 503);
    }
  const result = await db.transaction(async (tx) => {
    if (!(await attempt(tx, `login:${data.email}`, 5)))
      return { error: 'Too many attempts; try again in 15 minutes', status: 429 };
    const user = (await tx.query('SELECT * FROM staff WHERE lower(email)=$1', [data.email]))
      .rows[0];
    let providerSession;
    if (tx.storage === 'padova') {
      if (!tx.authProvider) throw new AccessError('Supabase Auth is not configured', 503);
      try {
        providerSession = await tx.authProvider.signIn(data.email, data.password);
      } catch (error) {
        if (!(error instanceof AuthProviderError) || ![400, 401, 403, 422].includes(error.status))
          throw new AccessError(
            'Authentication provider unavailable; try again later',
            error instanceof AuthProviderError && error.status === 429 ? 429 : 503,
          );
      }
    }
    const valid =
      tx.storage === 'padova'
        ? !!providerSession &&
          providerSession.user.id === user?.id &&
          !!providerSession.user.email_confirmed_at
        : verifyPassword(data.password, user?.password_hash ?? dummyHash);
    if (!user || !valid || !user.active) {
      if (providerSession)
        await tx.authProvider?.signOut(providerSession.access_token).catch(() => {});
      await securityEvent(tx, null, 'login_failed', user?.id ?? null);
      return { error: 'Invalid email or password', status: 401 };
    }
    const token = randomBytes(32).toString('hex');
    if (
      tx.storage !== 'padova' &&
      !user.password_hash.startsWith('scrypt$') &&
      data.password.length >= 14
    )
      await tx.query('UPDATE staff SET password_hash=$2 WHERE id=$1', [
        user.id,
        hashPassword(data.password),
      ]);
    await tx.query(
      "INSERT INTO sessions(token_hash,staff_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
      [tokenHash(token), user.id, user.auth_version],
    );
    if (providerSession)
      await tx.query('UPDATE sessions SET provider_state=$2 WHERE token_hash=$1', [
        tokenHash(token),
        sealSession(providerSession),
      ]);
    await tx.query('DELETE FROM auth_throttles WHERE bucket_hash=$1', [
      tokenHash(`login:${data.email}`),
    ]);
    await securityEvent(tx, user as Actor, 'login', user.id);
    return { token, user: publicUser(user) };
  });
  if (result.error) throw new AccessError(result.error, result.status);
  return result as { token: string; user: Row };
}
export async function logout(db: Database, token: string) {
  await db.transaction(async (tx) => {
    const actor = await sessionActor(tx, token);
    if (tx.storage === 'padova' && tx.authProvider) {
      const row = (
        await tx.query('SELECT provider_state FROM sessions WHERE token_hash=$1', [
          tokenHash(token),
        ])
      ).rows[0];
      if (row?.provider_state)
        try {
          await tx.authProvider.signOut(openSession(row.provider_state).access_token);
        } catch {
          await securityEvent(tx, actor, 'provider_logout_retry_needed', actor?.id ?? null);
        }
    }
    await tx.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
    if (actor) await securityEvent(tx, actor, 'logout', actor.id);
  });
}
export async function bootstrapOwner(
  db: Database,
  data: { name: string; email: string; password: string },
): Promise<Row & { recovery_codes: string[] }> {
  const values = z
    .object({ name: z.string().trim().min(1).max(120), email, password: passwordSchema })
    .parse(data);
  const hash = db.storage === 'padova' ? null : hashPassword(values.password);
  return db.transaction(async (tx) => {
    if (Number((await one(tx, 'SELECT count(*) count FROM staff')).count) > 0)
      throw new AccessError(
        'Initial owner already provisioned. Use authenticated user administration.',
      );
    const identity =
      tx.storage === 'padova'
        ? await tx.authProvider?.create(values.email, values.password, true)
        : null;
    if (tx.storage === 'padova' && !identity)
      throw new AccessError('Supabase Auth is not configured', 503);
    const user = await one(
      tx,
      `INSERT INTO staff(email,name,password_hash,role,permissions${identity ? ',id' : ''}) VALUES($1,$2,$3,'OWNER',$4${identity ? ',$5' : ''}) RETURNING id,name,email,role,permissions,active,auth_version`,
      [values.email, values.name, hash, OWNER_PERMISSIONS, ...(identity ? [identity.id] : [])],
    );
    await securityEvent(tx, user as Actor, 'owner_bootstrap', user.id, {
      email: user.email,
      role: user.role,
      method: 'Authorized local administrative terminal',
    });
    return { ...user, recovery_codes: await newPersonalCodes(tx, user.id) };
  });
}
function mayAdminister(actor: Actor, target: Row, next?: Row) {
  requirePermission(actor, 'manage_users');
  if (actor.role === 'OWNER') return;
  if (target.role === 'OWNER' || next?.role === 'OWNER')
    throw new AccessError('Only an Owner may administer Owner accounts');
  const allowed = effectivePermissions(actor);
  if ([...target.permissions, ...(next?.permissions ?? [])].some((p) => !allowed.includes(p)))
    throw new AccessError('You cannot administer access beyond your own granted permissions');
}
export async function createUser(db: Database, actor: Actor, input: unknown) {
  const data = userSchema.parse(input);
  const hash = db.storage === 'padova' ? null : hashPassword(randomBytes(48).toString('base64url'));
  return db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    mayAdminister(actor, { role: 'EMPLOYEE', permissions: [] }, data);
    const permissions = data.role === 'OWNER' ? OWNER_PERMISSIONS : [...new Set(data.permissions)];
    const identity =
      tx.storage === 'padova'
        ? await tx.authProvider?.create(data.email, randomBytes(48).toString('base64url'), false)
        : null;
    if (tx.storage === 'padova' && !identity)
      throw new AccessError('Supabase Auth is not configured', 503);
    const user = await one(
      tx,
      `INSERT INTO staff(email,name,password_hash,role,permissions,active${identity ? ',id' : ''}) VALUES($1,$2,$3,$4,$5,$6${identity ? ',$7' : ''}) RETURNING id,email,name,role,permissions,active,auth_version,created_at`,
      [
        data.email,
        data.name,
        hash,
        data.role,
        permissions,
        data.active,
        ...(identity ? [identity.id] : []),
      ],
    );
    await securityEvent(tx, actor, 'user_created', user.id, {
      ...user,
      requires_password_setup: true,
    });
    return user;
  });
}
export async function updateUser(db: Database, actor: Actor, input: unknown) {
  const data = userSchema
    .extend({ id: uuid, reason: z.string().trim().min(3).max(500) })
    .parse(input);
  return db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    const old = await one(
      tx,
      'SELECT id,email,name,role,permissions,active,auth_version FROM staff WHERE id=$1 FOR UPDATE',
      [data.id],
    );
    mayAdminister(actor, old, data);
    if (old.role === 'OWNER' && old.active && (data.role !== 'OWNER' || !data.active)) {
      const owners = await one(
        tx,
        "SELECT count(*) count FROM staff WHERE role='OWNER' AND active=true",
      );
      if (Number(owners.count) <= 1)
        throw new AccessError('The last active Owner cannot be deactivated or demoted');
    }
    const permissions = data.role === 'OWNER' ? OWNER_PERMISSIONS : [...new Set(data.permissions)];
    if (tx.storage === 'padova' && data.email !== old.email) {
      if (!tx.authProvider) throw new AccessError('Supabase Auth is not configured', 503);
      await tx.authProvider.update(data.id, { email: data.email });
    }
    const user = await one(
      tx,
      'UPDATE staff SET email=$2,name=$3,role=$4,permissions=$5,active=$6,auth_version=auth_version+1,updated_at=now() WHERE id=$1 RETURNING id,email,name,role,permissions,active,auth_version',
      [data.id, data.email, data.name, data.role, permissions, data.active],
    );
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [data.id]);
    if (!data.active)
      await tx.query(
        'UPDATE personal_recovery_codes SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
        [data.id],
      );
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [data.id],
    );
    await securityEvent(
      tx,
      actor,
      data.active ? 'user_access_updated' : 'user_deactivated',
      data.id,
      { ...user, reason: data.reason },
      old,
    );
    return user;
  });
}
export async function listUsers(db: Database, actor: Actor) {
  actor = await freshActor(db, actor);
  requirePermission(actor, 'manage_users');
  return {
    users: (
      await db.query(
        'SELECT id,email,name,role,permissions,active,created_at,updated_at FROM staff ORDER BY created_at',
      )
    ).rows,
    recoveryRequests: (
      await db.query(
        'SELECT r.id,r.staff_id,r.requested_at,s.name,s.email FROM recovery_requests r JOIN staff s ON s.id=r.staff_id WHERE r.handled_at IS NULL AND s.active=true ORDER BY r.requested_at',
      )
    ).rows,
    audit: (
      await db.query(
        'SELECT id,actor_id,actor_name,target_id,action,before_value,after_value,created_at FROM security_audit ORDER BY created_at DESC LIMIT 100',
      )
    ).rows,
    permissionCatalog: PERMISSIONS,
    employeeDefaults: EMPLOYEE_PERMISSIONS,
  };
}
export async function requestRecovery(db: Database, input: unknown) {
  const data = z.object({ email }).parse(input);
  await db.transaction(async (tx) => {
    if (!(await attempt(tx, `recovery:${data.email}`, 3))) return;
    const user = (
      await tx.query('SELECT id FROM staff WHERE lower(email)=$1 AND active=true', [data.email])
    ).rows[0];
    if (user) {
      await tx.query('INSERT INTO recovery_requests(staff_id) VALUES($1)', [user.id]);
      await securityEvent(tx, null, 'recovery_requested', user.id);
    }
  });
  return {
    message:
      'If this is an active account, its recovery request is available to the Owner. Contact your Owner through a verified private channel for a recovery link.',
  };
}
export async function issueRecovery(db: Database, actor: Actor, target: string) {
  uuid.parse(target);
  return db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    const user = await one(
      tx,
      'SELECT id,name,role,permissions,active,auth_version FROM staff WHERE id=$1 FOR UPDATE',
      [target],
    );
    mayAdminister(actor, user);
    if (!user.active) throw new AccessError('Reactivate the user before issuing a recovery link');
    const token = randomBytes(32).toString('hex');
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [target],
    );
    const row = await one(
      tx,
      "INSERT INTO password_reset_tokens(token_hash,staff_id,issued_by,auth_version,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes') RETURNING expires_at",
      [tokenHash(token), target, actor.id, user.auth_version],
    );
    await tx.query(
      'UPDATE recovery_requests SET handled_at=now() WHERE staff_id=$1 AND handled_at IS NULL',
      [target],
    );
    await securityEvent(tx, actor, 'recovery_link_issued', target, { expires_at: row.expires_at });
    return { token, expires_at: row.expires_at };
  });
}
export async function completeRecovery(db: Database, input: unknown) {
  if (db.storage === 'padova') return hostedRecovery(db, input, 'link');
  const data = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
    .parse(input);
  const hash = hashPassword(data.password);
  const result = await db.transaction(async (tx) => {
    if (!(await attempt(tx, `reset:${tokenHash(data.token)}`, 7)))
      return { error: 'Invalid or expired recovery link' };
    const reset = (
      await tx.query(
        'SELECT t.*,s.name,s.email,s.active,s.auth_version current_version FROM password_reset_tokens t JOIN staff s ON s.id=t.staff_id WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() FOR UPDATE',
        [tokenHash(data.token)],
      )
    ).rows[0];
    if (!reset || !reset.active || Number(reset.auth_version) !== Number(reset.current_version))
      return { error: 'Invalid or expired recovery link' };
    await tx.query(
      'UPDATE staff SET password_hash=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1',
      [reset.staff_id, hash],
    );
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [reset.staff_id]);
    await clearLoginThrottle(tx, reset.email);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [reset.staff_id],
    );
    await tx.query(
      'UPDATE recovery_requests SET handled_at=now() WHERE staff_id=$1 AND handled_at IS NULL',
      [reset.staff_id],
    );
    await securityEvent(
      tx,
      { id: reset.staff_id, name: reset.name, permissions: [] },
      'password_reset',
      reset.staff_id,
      { method: 'Single-use recovery credential', sessions_revoked: true },
    );
    return { ok: true, recovery_codes: await newPersonalCodes(tx, reset.staff_id) };
  });
  if (result.error) throw new AccessError(result.error, 400);
  return { ok: true, recovery_codes: result.recovery_codes };
}
export async function recoverWithPersonalCode(db: Database, input: unknown) {
  if (db.storage === 'padova') return hostedRecovery(db, input, 'code');
  const data = z.object({ email, code: z.string().max(80), password: passwordSchema }).parse(input);
  const normalized = data.code.toLowerCase().replaceAll('-', '').trim(),
    hash = hashPassword(data.password);
  const result = await db.transaction(async (tx) => {
    if (!(await attempt(tx, `personal_recovery:${data.email}`, 5)))
      return { error: 'Invalid recovery credentials or too many attempts' };
    const user = (
      await tx.query('SELECT id,name,active FROM staff WHERE lower(email)=$1 FOR UPDATE', [
        data.email,
      ])
    ).rows[0];
    if (!user?.active || !/^[a-f0-9]{32}$/.test(normalized))
      return { error: 'Invalid recovery credentials or too many attempts' };
    const code = (
      await tx.query(
        'SELECT code_hash FROM personal_recovery_codes WHERE code_hash=$1 AND staff_id=$2 AND used_at IS NULL FOR UPDATE',
        [tokenHash(`${user.id}:${normalized}`), user.id],
      )
    ).rows[0];
    if (!code) {
      await securityEvent(tx, null, 'personal_recovery_failed', user.id);
      return { error: 'Invalid recovery credentials or too many attempts' };
    }
    await tx.query(
      'UPDATE staff SET password_hash=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1',
      [user.id, hash],
    );
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [user.id]);
    await clearLoginThrottle(tx, data.email);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [user.id],
    );
    await tx.query(
      'UPDATE recovery_requests SET handled_at=now() WHERE staff_id=$1 AND handled_at IS NULL',
      [user.id],
    );
    await securityEvent(
      tx,
      { id: user.id, name: user.name, permissions: [] },
      'password_recovered',
      user.id,
      { method: 'Personal single-use offline recovery code', sessions_revoked: true },
    );
    return { ok: true, recovery_codes: await newPersonalCodes(tx, user.id) };
  });
  if (result.error) throw new AccessError(result.error, 400);
  return { ok: true, recovery_codes: result.recovery_codes };
}
export async function regeneratePersonalCodes(db: Database, actor: Actor, input: unknown) {
  const data = z.object({ current_password: z.string().max(500) }).parse(input);
  const result = await db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    if (!(await attempt(tx, `recovery_codes:${actor.id}`, 5)))
      return { error: 'Too many attempts; try later' };
    const user = await one(tx, 'SELECT password_hash,email FROM staff WHERE id=$1', [actor.id]);
    let valid = false;
    if (tx.storage === 'padova' && tx.authProvider) {
      try {
        const proof = await tx.authProvider.signIn(user.email, data.current_password);
        valid = proof.user.id === actor.id;
        await tx.authProvider.signOut(proof.access_token);
      } catch {}
    } else if (tx.storage !== 'padova')
      valid = verifyPassword(data.current_password, user.password_hash);
    if (!valid) return { error: 'Current password is incorrect' };
    const recovery_codes = await newPersonalCodes(tx, actor.id);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [actor.id],
    );
    await securityEvent(tx, actor, 'personal_recovery_codes_replaced', actor.id, {
      count: 8,
      prior_codes_invalidated: true,
    });
    return { recovery_codes };
  });
  if (result.error) throw new AccessError(result.error);
  return { recovery_codes: result.recovery_codes };
}
export async function changePassword(db: Database, actor: Actor, input: unknown) {
  if (db.storage === 'padova') return hostedPasswordChange(db, actor, input);
  const data = z
    .object({ current_password: z.string().max(500), password: passwordSchema })
    .parse(input);
  const hash = hashPassword(data.password);
  const result = await db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    const user = await one(tx, 'SELECT password_hash FROM staff WHERE id=$1', [actor.id]);
    if (!(await attempt(tx, `password_change:${actor.id}`, 5)))
      return { error: 'Too many attempts; try later', status: 429 };
    if (!verifyPassword(data.current_password, user.password_hash))
      return { error: 'Current password is incorrect', status: 403 };
    await tx.query(
      'UPDATE staff SET password_hash=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1',
      [actor.id, hash],
    );
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [actor.id]);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [actor.id],
    );
    await securityEvent(tx, actor, 'password_changed', actor.id, { sessions_revoked: true });
    return { ok: true };
  });
  if (result.error) throw new AccessError(result.error, result.status);
  return { ok: true };
}
