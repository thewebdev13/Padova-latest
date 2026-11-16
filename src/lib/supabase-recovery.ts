import { z } from 'zod';
import type { Database } from './db';
import { one } from './db';
import type { Actor } from './permissions';
import { tokenHash } from './credentials';
import {
  AccessError,
  attempt,
  clearLoginThrottle,
  freshActor,
  newPersonalCodes,
  securityEvent,
} from './users';

const password = z.string().min(14).max(500);
/** Claim/revoke commits before the external provider write: retries cannot reuse a credential. */
export async function hostedRecovery(db: Database, input: unknown, method: 'link' | 'code') {
  const data =
    method === 'link'
      ? z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).parse(input)
      : z
          .object({
            email: z
              .string()
              .trim()
              .email()
              .transform((x) => x.toLowerCase()),
            code: z.string().max(80),
            password,
          })
          .parse(input);
  if (!db.authProvider) throw new AccessError('Supabase Auth is not configured', 503);
  const claim = await db.transaction(async (tx) => {
    let user: any, claimedCode: string | undefined;
    if ('token' in data) {
      if (!(await attempt(tx, `reset:${tokenHash(data.token)}`, 7))) return null;
      const link = (
        await tx.query(
          'SELECT t.*,s.name,s.email FROM password_reset_tokens t JOIN staff s ON s.id=t.staff_id WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND s.active=true AND t.auth_version=s.auth_version FOR UPDATE OF t',
          [tokenHash(data.token)],
        )
      ).rows[0];
      if (!link) return null;
      user = { id: link.staff_id, name: link.name, email: link.email };
    } else {
      if (!(await attempt(tx, `personal_recovery:${data.email}`, 5))) return null;
      user = (
        await tx.query(
          'SELECT id,name,email FROM staff WHERE lower(email)=$1 AND active=true FOR UPDATE',
          [data.email],
        )
      ).rows[0];
      const code = data.code.toLowerCase().replaceAll('-', '').trim();
      if (!user || !/^[a-f0-9]{32}$/.test(code)) return null;
      const match = (
        await tx.query(
          'SELECT code_hash FROM personal_recovery_codes WHERE code_hash=$1 AND staff_id=$2 AND used_at IS NULL FOR UPDATE',
          [tokenHash(`${user.id}:${code}`), user.id],
        )
      ).rows[0];
      if (!match) return null;
      claimedCode = match.code_hash;
    }
    await tx.query('UPDATE staff SET auth_version=auth_version+1,updated_at=now() WHERE id=$1', [
      user.id,
    ]);
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [user.id]);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [user.id],
    );
    if (claimedCode)
      await tx.query(
        'UPDATE personal_recovery_codes SET used_at=now() WHERE code_hash=$1 AND used_at IS NULL',
        [claimedCode],
      );
    await securityEvent(
      tx,
      { ...user, permissions: [] },
      'provider_password_reset_claimed',
      user.id,
      { method, sessions_revoked: true },
    );
    return user;
  });
  if (!claim) throw new AccessError('Invalid or expired recovery credentials', 400);
  try {
    await db.authProvider.update(claim.id, { password: data.password, email_confirm: true });
  } catch {
    await db.transaction((tx) =>
      securityEvent(tx, { ...claim, permissions: [] }, 'provider_password_reset_failed', claim.id, {
        method,
        credential_consumed: true,
      }),
    );
    throw new AccessError(
      'Provider reset failed. Request a fresh link or use another recovery code.',
      503,
    );
  }
  return db.transaction(async (tx) => {
    await clearLoginThrottle(tx, claim.email);
    await tx.query(
      'UPDATE recovery_requests SET handled_at=now() WHERE staff_id=$1 AND handled_at IS NULL',
      [claim.id],
    );
    const current = await one(tx, 'SELECT active FROM staff WHERE id=$1', [claim.id]);
    if (!current.active) throw new AccessError('Account no longer active', 401);
    await securityEvent(tx, { ...claim, permissions: [] }, 'password_reset', claim.id, {
      method,
      provider: 'Supabase Auth',
      sessions_revoked: true,
    });
    return { ok: true, recovery_codes: await newPersonalCodes(tx, claim.id) };
  });
}
export async function hostedPasswordChange(db: Database, actor: Actor, input: unknown) {
  const data = z.object({ current_password: z.string().max(500), password }).parse(input);
  if (!db.authProvider) throw new AccessError('Supabase Auth is not configured', 503);
  const proof = await db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    if (!(await attempt(tx, `password_change:${actor.id}`, 5))) return false;
    const user = await one(tx, 'SELECT email FROM staff WHERE id=$1', [actor.id]);
    try {
      const s = await db.authProvider!.signIn(user.email, data.current_password);
      const valid = s.user.id === actor.id;
      await db.authProvider!.signOut(s.access_token);
      return valid;
    } catch {
      return false;
    }
  });
  if (!proof) throw new AccessError('Current password is incorrect or attempts exceeded');
  await db.transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    await tx.query('UPDATE staff SET auth_version=auth_version+1,updated_at=now() WHERE id=$1', [
      actor.id,
    ]);
    await tx.query('DELETE FROM sessions WHERE staff_id=$1', [actor.id]);
    await tx.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE staff_id=$1 AND used_at IS NULL',
      [actor.id],
    );
    await securityEvent(tx, actor, 'provider_password_change_claimed', actor.id, {
      sessions_revoked: true,
    });
  });
  try {
    await db.authProvider.update(actor.id, { password: data.password });
  } catch {
    await db.transaction((tx) =>
      securityEvent(tx, actor, 'provider_password_change_failed', actor.id),
    );
    throw new AccessError(
      'Provider rejected password change; sign in again or recover access',
      503,
    );
  }
  await db.transaction((tx) =>
    securityEvent(tx, actor, 'password_changed', actor.id, {
      provider: 'Supabase Auth',
      sessions_revoked: true,
    }),
  );
  return { ok: true };
}
