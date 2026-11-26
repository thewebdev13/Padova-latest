/**
 * Plan v1 — Owner-approved invoice email to the customer.
 * Reuses Resend / Gmail send paths already used for password reset.
 * Nothing is sent automatically; WhatsApp Owner copy is clipboard-only (helper never sends).
 */

import {
  refreshGmailAccessToken,
  refreshTokenForMailbox,
} from './email-gmail';
import {
  formatInvoicePreviewPlainText,
  formatInvoiceWhatsAppOwnerCopy,
  type InvoicePreview,
} from './invoice-preview';

export { formatInvoiceWhatsAppOwnerCopy };

export type InvoiceMailInput = {
  to: string;
  customerName: string;
  plainText: string;
  subject?: string;
};

function invoiceFromAddress(): string {
  return (
    process.env.PADOVA_INVOICE_FROM?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_FROM?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_MAILBOX?.trim() ||
    'bookings@padovatravel.com'
  );
}

function invoiceMailboxForSend(): string {
  return (
    process.env.PADOVA_INVOICE_MAILBOX?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_MAILBOX?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_FROM?.trim() ||
    'bookings@padovatravel.com'
  );
}

/** True when Resend key or Gmail refresh token can deliver outbound mail. */
export function invoiceMailConfigured(): boolean {
  const resend = Boolean(
    process.env.PADOVA_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim(),
  );
  if (resend) return true;
  return Boolean(refreshTokenForMailbox(invoiceMailboxForSend()));
}

export function resolveInvoiceRecipientEmail(
  partyEmail: string | null | undefined,
  override?: string | null,
): string | null {
  const explicit = String(override || '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit.includes('@') ? explicit : null;
  const party = String(partyEmail || '')
    .trim()
    .toLowerCase();
  if (party.includes('@')) return party;
  return null;
}

export function buildInvoiceEmailBodies(preview: InvoicePreview): {
  subject: string;
  text: string;
  html: string;
} {
  const text = [
    `Padova Travel invoice · ${preview.customer_name}`,
    '',
    formatInvoicePreviewPlainText(preview),
    '',
    '— Padova Travel',
    'This invoice was sent only after Owner approval. Reply to this mailbox with questions.',
  ].join('\n');
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f332c">
<p><strong>Padova Travel invoice</strong> · ${preview.customer_name.replace(/</g, '')}</p>
<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${escaped}</pre>
<p style="color:#5a6b63;font-size:13px">Sent only after Owner approval. Nothing is sent automatically.</p>
</body></html>`;
  const subject = `Padova invoice · ${preview.customer_name}`;
  return { subject, text, html };
}

export function invoiceSendNote(args: {
  to: string;
  whatsappCopyNoted?: boolean;
}): string {
  const parts = [`Sent by system email to ${args.to}`];
  if (args.whatsappCopyNoted) parts.push('Owner WhatsApp copy prepared (clipboard; not auto-sent)');
  return parts.join(' · ');
}

async function sendViaResend(to: string, subject: string, text: string, html: string) {
  const key = process.env.PADOVA_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = invoiceFromAddress();
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
  const boundary = `padova_inv_${Date.now().toString(36)}`;
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
  const mailbox = invoiceMailboxForSend();
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
      error?: { message?: string };
    };
    throw new Error(
      json.error?.message || `Gmail send failed (${res.status}). Re-consent may need gmail.send.`,
    );
  }
  return true;
}

/** Returns true when a provider accepted the message. Never invents success. */
export async function sendInvoiceCustomerEmail(input: InvoiceMailInput): Promise<boolean> {
  const to = resolveInvoiceRecipientEmail(input.to);
  if (!to) throw new Error('Customer email is Unknown — cannot send until an address is recorded');
  const subject = input.subject || `Padova invoice · ${input.customerName}`;
  const text = input.plainText;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f332c"><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')}</pre></body></html>`;
  if (await sendViaResend(to, subject, text, html)) return true;
  if (await sendViaGmail(to, subject, text, html)) return true;
  return false;
}
