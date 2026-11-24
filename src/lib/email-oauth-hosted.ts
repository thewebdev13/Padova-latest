import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertAllowedIntakeMailbox } from './booking-intake';
import { emailIntakeClientId, emailIntakeClientSecret } from './email-gmail';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export function emailOAuthRedirectUri(requestUrl: string): string {
  const configured = process.env.PADOVA_EMAIL_INTAKE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const origin = new URL(requestUrl).origin;
  return `${origin}/api/booking-intake/email/oauth/callback`;
}

export function emailOAuthEnvKeyForMailbox(mailbox: string): string {
  const normalized = assertAllowedIntakeMailbox(mailbox);
  if (normalized.startsWith('shmuel@')) return 'PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL';
  if (normalized.startsWith('mindy@')) return 'PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY';
  if (normalized.startsWith('bookings@')) return 'PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS';
  return 'PADOVA_EMAIL_INTAKE_REFRESH_TOKEN';
}

function stateSecret() {
  return (
    process.env.PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET?.trim() ||
    process.env.PADOVA_EMAIL_INTAKE_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    emailIntakeClientSecret()
  );
}

export function assertEmailOAuthSetupAccess(setupKey: string | null | undefined) {
  const expected = process.env.PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET?.trim();
  if (!expected) {
    throw new Error(
      'Hosted email OAuth needs PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET on the server (one-time setup key; not a mailbox password)',
    );
  }
  if (!setupKey || setupKey !== expected) throw new Error('Email OAuth setup authorization rejected');
}

type OAuthState = { mailbox: string; exp: number; n: string };

export function signEmailOAuthState(mailbox: string): string {
  const payload: OAuthState = {
    mailbox: assertAllowedIntakeMailbox(mailbox),
    exp: Date.now() + 20 * 60 * 1000,
    n: crypto.randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyEmailOAuthState(state: string | null): OAuthState {
  if (!state || !state.includes('.')) throw new Error('Invalid OAuth state');
  const [body, sig] = state.split('.');
  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid OAuth state signature');
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState;
  if (!parsed?.mailbox || !parsed.exp) throw new Error('Invalid OAuth state payload');
  if (Date.now() > parsed.exp) throw new Error('OAuth link expired; start again');
  parsed.mailbox = assertAllowedIntakeMailbox(parsed.mailbox);
  return parsed;
}

export function buildGoogleEmailOAuthUrl(input: {
  mailbox: string;
  redirectUri: string;
  state: string;
}) {
  const clientId = emailIntakeClientId();
  if (!clientId) throw new Error('Missing PADOVA_EMAIL_INTAKE_CLIENT_ID');
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', input.redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', GMAIL_SCOPES);
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('login_hint', input.mailbox);
  auth.searchParams.set('state', input.state);
  return auth.toString();
}

export async function exchangeEmailOAuthCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ refresh_token?: string; access_token?: string; error?: string }> {
  const clientId = emailIntakeClientId();
  const clientSecret = emailIntakeClientSecret();
  if (!clientId || !clientSecret) throw new Error('Missing Gmail OAuth client id/secret');
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    return { error: json.error_description || json.error || `token exchange failed (${res.status})` };
  }
  return { refresh_token: json.refresh_token, access_token: json.access_token };
}
