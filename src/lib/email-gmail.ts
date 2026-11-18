/** Gmail API helpers for Padova email intake (draft-only). No money posts. */

export type GmailTokenSet = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

export type GmailListedMessage = { id: string; threadId?: string };

export type GmailFetchedMessage = {
  id: string;
  threadId?: string;
  from_address?: string;
  subject?: string;
  received_at?: string;
  text: string;
  snippet?: string;
};

function requireEnv(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} for email intake OAuth`);
  return v;
}

export function emailIntakeClientId() {
  return process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID?.trim() || '';
}

export function emailIntakeClientSecret() {
  return process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET?.trim() || '';
}

/** Per-mailbox refresh token, with shared fallback. */
export function refreshTokenForMailbox(mailbox: string): string | null {
  const normalized = mailbox.trim().toLowerCase();
  if (normalized === 'shmuel@padovatravel.com') {
    return (
      process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL?.trim() ||
      process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN?.trim() ||
      null
    );
  }
  if (normalized === 'mindy@padovatravel.com') {
    return (
      process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY?.trim() ||
      process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN?.trim() ||
      null
    );
  }
  return process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN?.trim() || null;
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<GmailTokenSet> {
  const clientId = requireEnv('PADOVA_EMAIL_INTAKE_CLIENT_ID');
  const clientSecret = requireEnv('PADOVA_EMAIL_INTAKE_CLIENT_SECRET');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as GmailTokenSet & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Gmail token refresh failed: ${json.error_description || json.error || res.status}`,
    );
  }
  return json;
}

function gmailHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
}

export async function listUnreadGmailMessages(
  accessToken: string,
  opts?: { maxResults?: number; query?: string },
): Promise<GmailListedMessage[]> {
  const maxResults = Math.min(Math.max(opts?.maxResults ?? 15, 1), 50);
  const q = opts?.query ?? 'is:unread newer_than:21d -category:promotions -category:social';
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url, { headers: gmailHeaders(accessToken) });
  const json = (await res.json()) as {
    messages?: GmailListedMessage[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || `Gmail list failed (${res.status})`);
  return json.messages ?? [];
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function htmlToRoughText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function collectParts(part: GmailPart | undefined, out: { plain: string[]; html: string[] }) {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime === 'text/plain') out.plain.push(decoded);
    else if (mime === 'text/html') out.html.push(decoded);
  }
  for (const child of part.parts || []) collectParts(child, out);
}

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
) {
  const found = headers?.find((h) => (h.name || '').toLowerCase() === name.toLowerCase());
  return found?.value?.trim() || undefined;
}

export async function fetchGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailFetchedMessage> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
  );
  url.searchParams.set('format', 'full');
  const res = await fetch(url, { headers: gmailHeaders(accessToken) });
  const json = (await res.json()) as {
    id?: string;
    threadId?: string;
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> };
    error?: { message?: string };
  };
  if (!res.ok || !json.id) throw new Error(json.error?.message || `Gmail fetch failed (${res.status})`);

  const buckets = { plain: [] as string[], html: [] as string[] };
  collectParts(json.payload, buckets);
  let text = buckets.plain.join('\n\n').trim();
  if (!text && buckets.html.length) text = htmlToRoughText(buckets.html.join('\n'));
  if (!text && json.snippet) text = String(json.snippet).trim();

  const headers = json.payload?.headers;
  const from = headerValue(headers, 'From');
  const subject = headerValue(headers, 'Subject');
  const dateHdr = headerValue(headers, 'Date');
  const received_at = json.internalDate
    ? new Date(Number(json.internalDate)).toISOString()
    : dateHdr
      ? new Date(dateHdr).toISOString()
      : undefined;

  return {
    id: json.id,
    threadId: json.threadId,
    from_address: from,
    subject,
    received_at,
    text,
    snippet: json.snippet,
  };
}

/** Mark processed so the same unread mail is not polled forever. */
export async function markGmailMessageRead(accessToken: string, messageId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...gmailHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message || `Gmail mark-read failed (${res.status})`);
  }
}

/** Conservative booking/travel relevance — skip newsletters when no travel signals. */
export function looksLikeBookingRelatedEmail(input: {
  subject?: string;
  text?: string;
  from_address?: string;
}): boolean {
  const hay = `${input.subject || ''}\n${input.from_address || ''}\n${input.text || ''}`.toLowerCase();
  if (!hay.trim()) return false;
  const positive =
    /\b(confirm(ation|ed)?|reservation|itinerary|booking|e-?ticket|ticket number|record locator|pnr|check[- ]?in|check[- ]?out|flight|hotel|airline|marriott|hilton|hyatt|amex travel|expedia|booking\.com|capital one travel|united airlines|delta air|el al|taap|trip id|confirmation (no|#|number)|guest name|depart|arrival)\b/i.test(
      hay,
    );
  if (positive) return true;
  // Field:Value style already used by staff intake
  if (/^(product|customer|traveler|property|sale|total)\s*:/im.test(input.text || '')) return true;
  return false;
}

export function googleOAuthAuthorizeUrl(opts: {
  redirectUri: string;
  state?: string;
  loginHint?: string;
}) {
  const clientId = requireEnv('PADOVA_EMAIL_INTAKE_CLIENT_ID');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.readonly',
  );
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  if (opts.state) url.searchParams.set('state', opts.state);
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint);
  return url.toString();
}

export async function exchangeGoogleAuthCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<{ refresh_token?: string; access_token?: string; email_hint?: string }> {
  const clientId = requireEnv('PADOVA_EMAIL_INTAKE_CLIENT_ID');
  const clientSecret = requireEnv('PADOVA_EMAIL_INTAKE_CLIENT_SECRET');
  const body = new URLSearchParams({
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: opts.redirectUri,
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
    throw new Error(json.error_description || json.error || `OAuth exchange failed (${res.status})`);
  }
  return json;
}
