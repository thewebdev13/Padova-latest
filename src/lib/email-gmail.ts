/** Gmail API helpers for Padova email intake (draft-only). No money posts. */

export { looksLikeBookingRelatedEmail } from './booking-message-detect';

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
  /** PDF attachment extracts appended into text for booking detect + draft. */
  pdf_filenames?: string[];
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

/**
 * Mailboxes that are Google aliases of another connected inbox (no separate OAuth).
 * Default: none — Owner confirmed mindy@ is its own mailbox (not an alias of bookings@).
 * Optional comma list: PADOVA_EMAIL_INTAKE_ALIAS_MAILBOXES=
 */
export function emailIntakeAliasMailboxes(): string[] {
  const raw = process.env.PADOVA_EMAIL_INTAKE_ALIAS_MAILBOXES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailIntakeAliasMailbox(mailbox: string): boolean {
  return emailIntakeAliasMailboxes().includes(mailbox.trim().toLowerCase());
}

/**
 * Per-mailbox refresh token.
 * Owner boxes use only their dedicated env keys (never a personal/test shared token).
 * Alias mailboxes usually have no token — poll skips them (mail arrives in the primary inbox).
 * Optional `PADOVA_EMAIL_INTAKE_TEST_MAILBOX` may use `PADOVA_EMAIL_INTAKE_REFRESH_TOKEN`.
 */
export function refreshTokenForMailbox(mailbox: string): string | null {
  const normalized = mailbox.trim().toLowerCase();
  if (normalized === 'shmuel@padovatravel.com') {
    return process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL?.trim() || null;
  }
  if (normalized === 'mindy@padovatravel.com') {
    return process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY?.trim() || null;
  }
  if (normalized === 'bookings@padovatravel.com' || normalized === 'bookings@padovatravels.com') {
    return process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS?.trim() || null;
  }
  const test = process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX?.trim().toLowerCase();
  if (test && normalized === test) {
    return process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN?.trim() || null;
  }
  return null;
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
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

function collectParts(
  part: GmailPart | undefined,
  out: {
    plain: string[];
    html: string[];
    pdfs: Array<{ filename: string; attachmentId?: string; inlineData?: string }>;
  },
) {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  const filename = part.filename || 'attachment.pdf';
  if (mime === 'application/pdf' || /\.pdf$/i.test(filename)) {
    if (part.body?.attachmentId)
      out.pdfs.push({ filename, attachmentId: part.body.attachmentId });
    else if (part.body?.data) out.pdfs.push({ filename, inlineData: part.body.data });
  } else if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime === 'text/plain') out.plain.push(decoded);
    else if (mime === 'text/html') out.html.push(decoded);
  }
  for (const child of part.parts || []) collectParts(child, out);
}

async function fetchGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetch(url, { headers: gmailHeaders(accessToken) });
  const json = (await res.json()) as { data?: string; error?: { message?: string } };
  if (!res.ok || !json.data)
    throw new Error(json.error?.message || `Gmail attachment failed (${res.status})`);
  return Buffer.from(json.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
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

  const buckets = {
    plain: [] as string[],
    html: [] as string[],
    pdfs: [] as Array<{ filename: string; attachmentId?: string; inlineData?: string }>,
  };
  collectParts(json.payload, buckets);
  let text = buckets.plain.join('\n\n').trim();
  if (!text && buckets.html.length) text = htmlToRoughText(buckets.html.join('\n'));
  if (!text && json.snippet) text = String(json.snippet).trim();

  const pdf_filenames: string[] = [];
  // Cap PDF extracts so one huge mail cannot stall poll (same spirit as intake size limits).
  for (const pdf of buckets.pdfs.slice(0, 3)) {
    try {
      let bytes: Buffer;
      if (pdf.inlineData) bytes = Buffer.from(pdf.inlineData.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      else if (pdf.attachmentId)
        bytes = await fetchGmailAttachment(accessToken, json.id, pdf.attachmentId);
      else continue;
      if (bytes.length > 8 * 1024 * 1024) continue;
      const { extractIntakeText } = await import('./booking-intake');
      const extracted = await extractIntakeText('application/pdf', bytes, pdf.filename);
      if (extracted.extractable && extracted.text?.trim()) {
        pdf_filenames.push(pdf.filename);
        text = text
          ? `${text}\n\n--- PDF: ${pdf.filename} ---\n${extracted.text.trim()}`
          : extracted.text.trim();
      }
    } catch {
      /* keep body-only if one PDF fails */
    }
  }

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
    pdf_filenames,
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
