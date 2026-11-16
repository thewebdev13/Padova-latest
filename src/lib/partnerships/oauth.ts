import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type Database, type SQL, one } from '../db';
import { type Actor, requirePermission } from '../permissions';
import { AccessError, securityEvent } from '../users';
import { partnershipActor, insert } from './service';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const pkce = (s: string) => createHash('sha256').update(s).digest('base64url');
export const scopes = ['partnerships:read', 'partnerships:write'] as const;
export function issuer() {
  const configured = process.env.PADOVA_PARTNERSHIP_ORIGIN;
  if (!configured) throw new Error('Partnership OAuth origin is not configured');
  const url = new URL(configured);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new Error('OAuth origin must be a clean origin');
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      !process.env.DATABASE_URL
    )
  )
    throw new Error('HTTPS is required for the partnership connection');
  return url.origin;
}
export const resource = () => `${issuer()}/api/partnerships/mcp`;
export function authorizationMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/partnerships/oauth/authorize`,
    token_endpoint: `${base}/api/partnerships/oauth/token`,
    registration_endpoint: `${base}/api/partnerships/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: scopes,
    authorization_response_iss_parameter_supported: true,
  };
}
function validRedirect(value: string) {
  const configured = (process.env.PADOVA_PARTNERSHIP_REDIRECT_URIS ?? '')
    .split(',')
    .filter(Boolean);
  // Only exact explicitly configured callbacks; registration cannot widen this set.
  return configured.includes(value) && new URL(value).protocol === 'https:';
}
export async function registerClient(db: Database, input: unknown) {
  const d = z
    .object({
      client_name: z.string().min(1).max(100),
      redirect_uris: z.array(z.string().url()).min(1).max(5),
      grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
      response_types: z.array(z.literal('code')).optional(),
      token_endpoint_auth_method: z.literal('none').optional(),
    })
    .parse(input);
  if (!d.redirect_uris.every(validRedirect))
    throw new AccessError('Callback is not in the owner-configured redirect allowlist');
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(71281104)');
    const existing = (
      await tx.query('SELECT * FROM pt_oauth_clients WHERE redirect_uris=$1', [d.redirect_uris])
    ).rows[0];
    const id = existing?.id ?? randomBytes(24).toString('hex');
    if (!existing) {
      if (Number((await one(tx, 'SELECT count(*) n FROM pt_oauth_clients')).n) >= 50)
        throw new Error('OAuth client registration capacity reached');
      await insert(tx, 'pt_oauth_clients', {
        id,
        name: d.client_name,
        redirect_uris: d.redirect_uris,
      });
    }
    return {
      client_id: id,
      client_name: d.client_name,
      redirect_uris: d.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  });
}
export const authorizeInput = z.object({
  client_id: z.string().min(1).max(200),
  redirect_uri: z.string().url(),
  response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
  resource: z.string().url(),
  scope: z.string().max(100),
  state: z.string().min(1).max(1000),
});
export async function consentDetails(db: Database, actor: Actor, input: unknown) {
  const d = authorizeInput.parse(input);
  actor = await partnershipActor(db, actor);
  requirePermission(actor, 'manage_partnership_ai');
  if (d.resource !== resource() || !validRedirect(d.redirect_uri))
    throw new AccessError('OAuth resource or callback rejected');
  const client = await one(db, 'SELECT * FROM pt_oauth_clients WHERE id=$1', [d.client_id]);
  if (!client.redirect_uris.includes(d.redirect_uri))
    throw new AccessError('OAuth callback does not match registered client');
  const requested = d.scope.split(' ').filter(Boolean);
  if (
    !requested.length ||
    !requested.every((s) => (scopes as readonly string[]).includes(s)) ||
    !requested.includes('partnerships:read')
  )
    throw new AccessError('Unsupported partnership scope');
  if (requested.includes('partnerships:write')) requirePermission(actor, 'manage_partnerships');
  return { data: d, client, requested, actor };
}
export async function authorizeClient(db: Database, actor: Actor, input: unknown) {
  return db.transaction(async (tx) => {
    const details = await consentDetails(tx as Database, actor, input);
    const { data: d, requested } = details;
    actor = details.actor;
    const code = randomBytes(32).toString('base64url');
    await insert(tx, 'pt_oauth_codes', {
      code_hash: digest(code),
      staff_id: actor.id,
      client_id: d.client_id,
      redirect_uri: d.redirect_uri,
      challenge: d.code_challenge,
      resource: d.resource,
      scopes: requested,
      auth_version: actor.authVersion,
      expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
    });
    await securityEvent(tx, actor, 'partnership_ai_consent', actor.id, {
      client_id: d.client_id,
      scopes: requested,
    });
    const redirect = new URL(d.redirect_uri);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', d.state);
    redirect.searchParams.set('iss', issuer());
    return redirect.toString();
  });
}
export async function exchangeCode(db: Database, input: unknown) {
  if (
    input &&
    typeof input === 'object' &&
    'grant_type' in input &&
    input.grant_type === 'refresh_token'
  )
    return refreshAccess(db, input);
  const d = z
    .object({
      grant_type: z.literal('authorization_code'),
      code: z.string().min(20).max(200),
      client_id: z.string().min(1).max(200),
      redirect_uri: z.string().url(),
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      resource: z.string().url(),
    })
    .parse(input);
  return db.transaction(async (tx) => {
    const code = (
      await tx.query('SELECT * FROM pt_oauth_codes WHERE code_hash=$1 FOR UPDATE', [digest(d.code)])
    ).rows[0];
    if (
      !code ||
      code.used_at ||
      Date.parse(code.expires_at) <= Date.now() ||
      code.client_id !== d.client_id ||
      code.redirect_uri !== d.redirect_uri ||
      code.resource !== d.resource ||
      d.resource !== resource() ||
      code.challenge !== pkce(d.code_verifier)
    )
      throw new AccessError('Invalid or expired authorization code', 401);
    const actor = await partnershipActor(tx, {
      id: code.staff_id,
      name: 'OAuth staff',
      permissions: [],
      authVersion: code.auth_version,
    });
    requirePermission(actor, 'manage_partnership_ai');
    if (code.scopes.includes('partnerships:write')) requirePermission(actor, 'manage_partnerships');
    await tx.query('UPDATE pt_oauth_codes SET used_at=now() WHERE code_hash=$1', [digest(d.code)]);
    const token = randomBytes(32).toString('base64url');
    const grant = await insert(tx, 'pt_ai_grants', {
      staff_id: actor.id,
      token_hash: digest(token),
      scopes: code.scopes,
      auth_version: actor.authVersion,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      resource: d.resource,
      client_id: d.client_id,
    });
    const refreshToken = randomBytes(32).toString('base64url');
    await insert(tx, 'pt_ai_refresh_tokens', {
      token_hash: digest(refreshToken),
      grant_id: grant.id,
      expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
    });
    await securityEvent(tx, actor, 'partnership_ai_connected', actor.id, {
      client_id: d.client_id,
      scopes: code.scopes,
    });
    return {
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: code.scopes.join(' '),
    };
  });
}
async function refreshAccess(db: Database, input: unknown) {
  const d = z
    .object({
      grant_type: z.literal('refresh_token'),
      refresh_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      client_id: z.string().min(1).max(200),
      resource: z.string().url(),
      scope: z.string().max(100).optional(),
    })
    .parse(input);
  const result = await db.transaction(async (tx) => {
    // A single lock order matches consent/revocation and prevents concurrent rotation.
    await tx.query('SELECT pg_advisory_xact_lock(71281104)');
    const token = (
      await tx.query('SELECT * FROM pt_ai_refresh_tokens WHERE token_hash=$1 FOR UPDATE', [
        digest(d.refresh_token),
      ])
    ).rows[0];
    if (!token || Date.parse(token.expires_at) <= Date.now()) return null;
    const grant = await one(tx, 'SELECT * FROM pt_ai_grants WHERE id=$1 FOR UPDATE', [
      token.grant_id,
    ]);
    if (
      grant.revoked_at ||
      grant.client_id !== d.client_id ||
      grant.resource !== d.resource ||
      d.resource !== resource()
    )
      return null;
    if (d.scope && d.scope.split(' ').sort().join(' ') !== [...grant.scopes].sort().join(' '))
      return null;
    const actor = await partnershipActor(tx, {
      id: grant.staff_id,
      name: 'OAuth staff',
      permissions: [],
      authVersion: grant.auth_version,
    });
    requirePermission(actor, 'manage_partnership_ai');
    if (grant.scopes.includes('partnerships:write'))
      requirePermission(actor, 'manage_partnerships');
    if (token.used_at) {
      await tx.query('UPDATE pt_ai_grants SET revoked_at=now() WHERE id=$1', [grant.id]);
      await securityEvent(tx, actor, 'partnership_ai_refresh_replay_revoked', actor.id, {
        grant_id: grant.id,
      });
      return null; // Commit revocation before reporting invalid_grant.
    }
    const access = randomBytes(32).toString('base64url'),
      refresh = randomBytes(32).toString('base64url');
    await tx.query('UPDATE pt_ai_refresh_tokens SET used_at=now() WHERE id=$1', [token.id]);
    await tx.query('UPDATE pt_ai_grants SET token_hash=$2,expires_at=$3 WHERE id=$1', [
      grant.id,
      digest(access),
      new Date(Math.min(Date.now() + 3600000, Date.parse(token.expires_at))).toISOString(),
    ]);
    await insert(tx, 'pt_ai_refresh_tokens', {
      token_hash: digest(refresh),
      grant_id: grant.id,
      expires_at: token.expires_at,
    });
    await securityEvent(tx, actor, 'partnership_ai_refreshed', actor.id, { grant_id: grant.id });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: Math.min(3600, Math.floor((Date.parse(token.expires_at) - Date.now()) / 1000)),
      scope: grant.scopes.join(' '),
    };
  });
  if (!result) throw new AccessError('Invalid, expired or reused refresh token', 401);
  return result;
}
export async function aiPrincipal(
  db: Database,
  authorization: string | null,
  scope: 'partnerships:read' | 'partnerships:write',
) {
  return db.transaction((tx) => aiPrincipalInTransaction(tx, authorization, scope));
}
export async function aiPrincipalInTransaction(
  tx: SQL,
  authorization: string | null,
  scope: 'partnerships:read' | 'partnerships:write',
) {
  if (!authorization?.startsWith('Bearer '))
    throw new AccessError('OAuth access token required', 401);
  const token = authorization.slice(7);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError('Invalid access token', 401);
  const grant = (
    await tx.query(
      'SELECT * FROM pt_ai_grants WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',
      [digest(token)],
    )
  ).rows[0];
  if (!grant || grant.resource !== resource() || !grant.scopes.includes(scope))
    throw new AccessError('Expired, revoked or insufficient scope', 401);
  const actor = await partnershipActor(
    tx,
    { id: grant.staff_id, name: 'OAuth staff', permissions: [], authVersion: grant.auth_version },
    scope === 'partnerships:write',
  );
  requirePermission(actor, 'manage_partnership_ai');
  await tx.query('UPDATE pt_ai_grants SET last_used_at=now() WHERE id=$1', [grant.id]);
  return actor;
}
export async function revokeGrant(db: Database, actor: Actor, id: string) {
  z.string().uuid().parse(id);
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor);
    requirePermission(actor, 'manage_partnership_ai');
    const g = await one(tx, 'SELECT * FROM pt_ai_grants WHERE id=$1', [id]);
    if (g.staff_id !== actor.id)
      throw new AccessError('Only your own connection can be revoked here');
    await tx.query('UPDATE pt_ai_grants SET revoked_at=now() WHERE id=$1', [id]);
    await securityEvent(tx, actor, 'partnership_ai_revoked', actor.id, { grant_id: id });
    return { revoked: true };
  });
}
