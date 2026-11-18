import {
  assertAllowedIntakeMailbox,
  buildIntakeDraft,
  intakeEmailMailboxes,
  INTAKE_EMAIL_MAILBOXES,
} from './booking-intake';
import type { Database } from './db';
import { looksLikeBookingRelatedEmail } from './booking-message-detect';
import { intakeDraftHasMinimumShape } from './intake-email-hints';
import {
  emailIntakeAliasMailboxes,
  fetchGmailMessage,
  isEmailIntakeAliasMailbox,
  listUnreadGmailMessages,
  markGmailMessageRead,
  refreshGmailAccessToken,
  refreshTokenForMailbox,
} from './email-gmail';
import { execute } from './finance';
import type { Actor } from './permissions';

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

export type EmailPollResult = {
  mailbox: string;
  scanned: number;
  created: Array<{ id: string; title: string; message_id: string; subject?: string }>;
  skipped: Array<{ message_id: string; reason: string; subject?: string }>;
  errors: Array<{ message_id?: string; error: string }>;
};

/** True when automated Gmail/Workspace polling credentials are present (Phase 3 live connect). */
export function emailIntakePollingConfigured() {
  const client =
    process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID?.trim() &&
    process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET?.trim();
  if (!client) return false;
  return intakeEmailMailboxes().some((box) => Boolean(refreshTokenForMailbox(box)));
}

export function emailIntakeStatus() {
  const configured = emailIntakePollingConfigured();
  const mailboxes = intakeEmailMailboxes();
  const mailbox_tokens = Object.fromEntries(
    mailboxes.map((box) => [box, Boolean(refreshTokenForMailbox(box))]),
  );
  const testMailbox = process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX?.trim().toLowerCase() || null;
  const alias_mailboxes = emailIntakeAliasMailboxes();
  return {
    mailboxes,
    owner_mailboxes: [...INTAKE_EMAIL_MAILBOXES],
    test_mailbox: testMailbox,
    alias_mailboxes,
    polling_configured: configured,
    mailbox_tokens,
    mode: configured ? 'workspace_oauth_ready' : 'manual_staff_forward_only',
    posts_money: false,
    live_booking: false,
    draft_only: true,
    poll_path: '/api/booking-intake/email/poll',
    note: configured
      ? 'OAuth env present. Poll creates booking drafts from unread booking-related mail. Never posts money.'
      : 'Automatic mailbox poll is not configured. Connect Shmuel@ / mindy@ / bookings@ via hosted OAuth — see docs/EMAIL_INTAKE_OAUTH.md.',
  };
}

/** Build a draft payload from an inbound email. Does not write to the database. */
export async function prepareEmailIntakeDraft(message: InboundEmailMessage) {
  const mailbox = assertAllowedIntakeMailbox(message.mailbox);
  if (!message.text?.trim()) throw new Error('Email intake requires message text');
  if (
    !looksLikeBookingRelatedEmail({
      subject: message.subject,
      text: message.text,
      from_address: message.from_address,
    })
  ) {
    throw new Error(
      'Email does not look like a booking/reservation; draft not created (unrelated skipped)',
    );
  }
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

export async function resolveEmailIntakeActor(
  db: Database,
  preferredId?: string | null,
): Promise<Actor> {
  const actorId =
    preferredId?.trim() ||
    process.env.PADOVA_EMAIL_INTAKE_ACTOR_ID?.trim() ||
    process.env.PADOVA_INSTINCT_ACTOR_ID?.trim() ||
    '';
  if (actorId) {
    const row = (
      await db.query(
        'SELECT id, name, role, permissions FROM staff WHERE id=$1 AND active=true',
        [actorId],
      )
    ).rows[0];
    if (!row) throw new Error('Email intake actor_id must be an active staff user');
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      permissions: row.permissions ?? [],
    };
  }
  const owner = (
    await db.query(
      `SELECT id, name, role, permissions FROM staff
       WHERE active=true AND role='Owner'
       ORDER BY created_at ASC NULLS LAST, name ASC
       LIMIT 1`,
    )
  ).rows[0];
  if (!owner)
    throw new Error(
      'Email intake requires PADOVA_EMAIL_INTAKE_ACTOR_ID or an active Owner staff user',
    );
  return {
    id: owner.id,
    name: owner.name,
    role: owner.role,
    permissions: owner.permissions ?? [],
  };
}

async function draftExistsForGmailMessage(db: Database, messageId: string) {
  const filename = `email:${messageId}`;
  const row = (
    await db.query(
      `SELECT id FROM booking_drafts
       WHERE entry->'intake_provenance'->>'filename' = $1
       LIMIT 1`,
      [filename],
    )
  ).rows[0];
  return Boolean(row?.id);
}

export function assertEmailPollAuth(headerToken: string | null | undefined) {
  const expected = [
    process.env.PADOVA_EMAIL_INTAKE_CRON_SECRET?.trim(),
    // Vercel Cron sends Authorization: Bearer $CRON_SECRET
    process.env.CRON_SECRET?.trim(),
  ].filter(Boolean) as string[];
  if (!expected.length) throw new Error('Email poll cron is not configured (missing cron secret)');
  if (!headerToken || !expected.includes(headerToken))
    throw new Error('Email poll authorization rejected');
}

/** True when this request is an authorized unattended poll (Padova secret or Vercel Cron). */
export function isAuthorizedEmailPollRequest(request: Request) {
  const token = readEmailPollAuthHeader(request);
  if (!token) return false;
  try {
    assertEmailPollAuth(token);
    return true;
  } catch {
    return false;
  }
}

export function readEmailPollAuthHeader(request: Request): string | null {
  const custom = request.headers.get('x-padova-email-poll');
  if (custom?.trim()) return custom.trim();
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Poll allow-listed mailboxes for unread booking-related mail → booking_draft only.
 * Idempotent on Gmail message id. Never invents money / never live booking.
 */
export async function pollEmailIntakeMailboxes(
  db: Database,
  opts?: {
    actor?: Actor | null;
    mailboxes?: string[];
    maxPerMailbox?: number;
    markRead?: boolean;
    dryRun?: boolean;
  },
): Promise<{ results: EmailPollResult[]; intake: ReturnType<typeof emailIntakeStatus> }> {
  if (!emailIntakePollingConfigured()) {
    throw new Error('Email intake OAuth is not configured');
  }
  const staff = opts?.actor ?? (await resolveEmailIntakeActor(db, null));
  const boxes = (opts?.mailboxes?.length ? opts.mailboxes : intakeEmailMailboxes()).map((b) =>
    assertAllowedIntakeMailbox(b),
  );
  const maxPerMailbox = Math.min(Math.max(opts?.maxPerMailbox ?? 10, 1), 30);
  const markRead = opts?.markRead !== false;
  const dryRun = Boolean(opts?.dryRun);
  const results: EmailPollResult[] = [];

  for (const mailbox of boxes) {
    const result: EmailPollResult = {
      mailbox,
      scanned: 0,
      created: [],
      skipped: [],
      errors: [],
    };
    const refresh = refreshTokenForMailbox(mailbox);
    if (!refresh) {
      if (isEmailIntakeAliasMailbox(mailbox)) {
        result.skipped.push({
          message_id: '—',
          reason: 'alias_mailbox_skip_poll',
          subject: 'Alias mailbox — mail is read via the primary Google inbox',
        });
      } else {
        result.errors.push({ error: `No refresh token configured for ${mailbox}` });
      }
      results.push(result);
      continue;
    }
    try {
      const token = await refreshGmailAccessToken(refresh);
      const listed = await listUnreadGmailMessages(token.access_token, {
        maxResults: maxPerMailbox,
      });
      result.scanned = listed.length;
      for (const item of listed) {
        try {
          if (await draftExistsForGmailMessage(db, item.id)) {
            result.skipped.push({
              message_id: item.id,
              reason: 'already_drafted',
            });
            if (markRead && !dryRun) {
              try {
                await markGmailMessageRead(token.access_token, item.id);
              } catch {
                /* keep unread if mark fails; dedupe still protects */
              }
            }
            continue;
          }
          const msg = await fetchGmailMessage(token.access_token, item.id);
          if (
            !looksLikeBookingRelatedEmail({
              subject: msg.subject,
              text: msg.text,
              from_address: msg.from_address,
            })
          ) {
            result.skipped.push({
              message_id: item.id,
              reason: 'not_booking_related',
              subject: msg.subject,
            });
            continue;
          }
          if (!msg.text?.trim()) {
            result.skipped.push({
              message_id: item.id,
              reason: 'empty_body',
              subject: msg.subject,
            });
            continue;
          }
          const built = await prepareEmailIntakeDraft({
            mailbox,
            from_address: msg.from_address,
            subject: msg.subject,
            text: msg.text,
            received_at: msg.received_at,
            message_id: msg.id,
          });
          const entry = built.entry as Record<string, unknown>;
          // Keep draft when at least one real booking field is present (never invent sale).
          if (
            !intakeDraftHasMinimumShape({
              entry,
              recognized_fields: built.recognized_fields,
            })
          ) {
            result.skipped.push({
              message_id: item.id,
              reason: 'insufficient_booking_fields',
              subject: msg.subject,
            });
            continue;
          }
          if (dryRun) {
            result.created.push({
              id: 'dry-run',
              title: built.title || msg.subject || 'Email intake dry-run',
              message_id: item.id,
              subject: msg.subject,
            });
            continue;
          }
          const saved = await execute(db, staff, {
            id: crypto.randomUUID(),
            kind: 'booking_draft',
            data: { title: built.title, entry: built.entry },
          });
          result.created.push({
            id: String(saved.id),
            title: built.title,
            message_id: msg.id,
            subject: msg.subject,
          });
          if (markRead) {
            try {
              await markGmailMessageRead(token.access_token, msg.id);
            } catch (e) {
              result.errors.push({
                message_id: msg.id,
                error: e instanceof Error ? e.message : 'mark-read failed',
              });
            }
          }
        } catch (e) {
          result.errors.push({
            message_id: item.id,
            error: e instanceof Error ? e.message : 'message failed',
          });
        }
      }
    } catch (e) {
      result.errors.push({ error: e instanceof Error ? e.message : 'mailbox poll failed' });
    }
    results.push(result);
  }

  return { results, intake: emailIntakeStatus() };
}
