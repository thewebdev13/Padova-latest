import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { selectedSupabaseProject } from './project';

export type AuthIdentity = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  updated_at?: string;
  banned_until?: string | null;
};
export type AuthSession = {
  user: AuthIdentity;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export class AuthProviderError extends Error {
  constructor(public status: number) {
    super(`Authentication provider rejected request (${status})`);
  }
}
export interface AuthProvider {
  signIn(email: string, password: string): Promise<AuthSession>;
  user(access: string): Promise<AuthIdentity>;
  refresh(refresh: string): Promise<AuthSession>;
  signOut(access: string): Promise<void>;
  create(email: string, password: string, confirmed: boolean): Promise<AuthIdentity>;
  update(
    id: string,
    values: { password?: string; email?: string; email_confirm?: boolean },
  ): Promise<void>;
}
export function lazySupabaseAuth(): AuthProvider {
  return {
    signIn: (e, p) => supabaseAuth().signIn(e, p),
    user: (a) => supabaseAuth().user(a),
    refresh: (r) => supabaseAuth().refresh(r),
    signOut: (a) => supabaseAuth().signOut(a),
    create: (e, p, c) => supabaseAuth().create(e, p, c),
    update: (id, v) => supabaseAuth().update(id, v),
  };
}
/** Server-only REST adapter to the documented Supabase Auth API; no SDK/session globals. */
export function supabaseAuth(
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): AuthProvider {
  const project = selectedSupabaseProject(env);
  const url = env.SUPABASE_URL ?? project.url;
  if (url !== project.url) throw new Error('Supabase Auth must use the pinned environment project');
  const key = env.SUPABASE_PUBLISHABLE_KEY,
    secret = env.SUPABASE_SECRET_KEY;
  if (!key || !secret) throw new Error('Configure private server Supabase Auth keys');
  async function request(
    path: string,
    body?: unknown,
    bearer?: string,
    method = body ? 'POST' : 'GET',
    admin = false,
  ) {
    const response = await fetcher(`${url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: admin ? secret! : key!,
        Authorization: `Bearer ${admin ? secret : (bearer ?? key)}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new AuthProviderError(response.status);
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw new AuthProviderError(502);
    }
  }
  const session = (r: any): AuthSession => {
    if (!r.user?.id || !r.access_token || !r.refresh_token)
      throw new Error('Invalid provider session');
    return {
      ...r,
      expires_at: r.expires_at ?? Math.floor(Date.now() / 1000) + Number(r.expires_in ?? 3600),
    };
  };
  return {
    signIn: async (email, password) =>
      session(await request('/token?grant_type=password', { email, password })),
    refresh: async (refresh_token) =>
      session(await request('/token?grant_type=refresh_token', { refresh_token })),
    user: async (access) => request('/user', undefined, access),
    signOut: async (access) => {
      await request('/logout?scope=local', {}, access);
    },
    create: async (email, password, confirmed) => {
      const r = await request(
        '/admin/users',
        { email, password, email_confirm: confirmed },
        undefined,
        'POST',
        true,
      );
      const u = r.user ?? r;
      if (!u.id) throw new Error('Invalid provider identity');
      return u;
    },
    update: async (id, values) => {
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid Auth user');
      await request(`/admin/users/${id}`, values, undefined, 'PUT', true);
    },
  };
}
function encryptionKey() {
  const value = process.env.PADOVA_AUTH_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(value, 'base64');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || key.length !== 32)
    throw new Error('Set a private 32-byte PADOVA_AUTH_ENCRYPTION_KEY');
  return key;
}
export function requireSessionEncryption() {
  encryptionKey();
}
export function sealSession(session: AuthSession) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(selectedSupabaseProject().ref));
  const body = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}
export function openSession(value: string): AuthSession {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 29) throw new Error('Invalid session envelope');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(selectedSupabaseProject().ref));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
}
