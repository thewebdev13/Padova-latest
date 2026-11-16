import {
  assertAllowedIntakeMailbox,
  buildIntakeDraft,
  INTAKE_EMAIL_MAILBOXES,
} from './booking-intake';

export type InboundEmailMessage = {
  /** Mailbox that received the message — must be one of the two Owner-approved addresses. */
  mailbox: string;
  from_address?: string;
  subject?: string;
  /** Plain-text body (preferred) or extracted text. */
  text: string;
  received_at?: string;
  message_id?: string;
};

/** True when automated Gmail/Workspace polling credentials are present (Phase 3 live connect). */
export function emailIntakePollingConfigured() {
  return Boolean(
    process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID?.trim() &&
      process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET?.trim() &&
      process.env.PADOVA_EMAIL_INTAKE_REFRESH_TOKEN?.trim(),
  );
}

export function emailIntakeStatus() {
  return {
    mailboxes: [...INTAKE_EMAIL_MAILBOXES],
    polling_configured: emailIntakePollingConfigured(),
    mode: emailIntakePollingConfigured() ? 'workspace_oauth_ready' : 'manual_staff_forward_only',
    posts_money: false,
    note: emailIntakePollingConfigured()
      ? 'Workspace OAuth env is present; connect poller before relying on automatic ingest.'
      : 'Automatic mailbox poll is not configured. Staff may forward message text through the booking-intake email endpoint. Waiting on Owner Workspace/OAuth for Shmuel@ and mindy@.',
  };
}

/** Build a draft payload from an inbound email. Does not write to the database. */
export function prepareEmailIntakeDraft(message: InboundEmailMessage) {
  const mailbox = assertAllowedIntakeMailbox(message.mailbox);
  if (!message.text?.trim()) throw new Error('Email intake requires message text');
  return buildIntakeDraft({
    source: 'email',
    text: message.text,
    mailbox,
    fromAddress: message.from_address,
    subject: message.subject,
    receivedAt: message.received_at,
    filename: message.message_id ? `email:${message.message_id}` : undefined,
    mimeType: 'message/rfc822',
  });
}
