/**
 * Password-reset email delivery for forgot-password.
 * Prefers Resend when configured; otherwise Gmail API via an intake mailbox refresh token.
 * Never logs the raw reset token.
 */

import {
  refreshGmailAccessToken,
  refreshTokenForMailbox,
} from './email-gmail';

export type PasswordResetMailInput = {
  to: string;
  resetUrl: string;
  expiresMinutes?: number;
};

function resetFromAddress(): string {
  return (
    process.env.PADOVA_PASSWORD_RESET_FROM?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_MAILBOX?.trim() ||
    'bookings@padovatravel.com'
  );
}

function resetMailboxForSend(): string {
  return (
    process.env.PADOVA_PASSWORD_RESET_MAILBOX?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_FROM?.trim() ||
    'bookings@padovatravel.com'
  );
}

function mailBodies(resetUrl: string, expiresMinutes: number) {
  const text = [
    'Padova password reset',
    '',
    'Use this single-use link to set a new password for your individual staff account:',
    resetUrl,
    '',
    `This link expires in ${expiresMinutes} minutes. If you did not request it, you can ignore this email.`,
    '',
    '— Padova Travel',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f332c">
<p>Padova password reset</p>
<p>Use this single-use link to set a new password for your individual staff account:</p>
<p><a href="${resetUrl.replace(/"/g, '')}">Set a new password</a></p>
<p style="color:#5a6b63;font-size:13px">This link expires in ${expiresMinutes} minutes. If you did not request it, you can ignore this email.</p>
<p>— Padova Travel</p>
</body></html>`;
  return { text, html };
}

async function sendViaResend(to: string, subject: string, text: string, html: string) {
  const key = process.env.PADOVA_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = resetFromAddress();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return true;
}

function buildRawMime(opts: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `padova_${Date.now().toString(36)}`;
  const lines = [
    `From: Padova Travel <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    opts.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    opts.html,
    '',
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sendViaGmail(to: string, subject: string, text: string, html: string) {
  const mailbox = resetMailboxForSend();
  const refresh = refreshTokenForMailbox(mailbox);
  if (!refresh) return false;
  const { access_token } = await refreshGmailAccessToken(refresh);
  const raw = buildRawMime({ from: mailbox, to, subject, text, html });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    throw new Error(
      json.error?.message || `Gmail send failed (${res.status}). Re-consent may need gmail.send.`,
    );
  }
  return true;
}

/** Returns true when a provider accepted the message. */
export async function sendPasswordResetEmail(input: PasswordResetMailInput): Promise<boolean> {
  const expiresMinutes = input.expiresMinutes ?? 30;
  const { text, html } = mailBodies(input.resetUrl, expiresMinutes);
  const subject = 'Reset your Padova password';
  if (await sendViaResend(input.to, subject, text, html)) return true;
  if (await sendViaGmail(input.to, subject, text, html)) return true;
  return false;
}

export function publicAppOrigin(requestUrl?: string): string {
  const configured = process.env.PADOVA_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  return 'http://127.0.0.1:3000';
}

export function passwordResetLink(origin: string, token: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/#reset=${encodeURIComponent(token)}`;
}
