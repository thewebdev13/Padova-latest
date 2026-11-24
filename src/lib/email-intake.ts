import {
  assertAllowedIntakeMailbox,
  buildIntakeDraft,
  intakeEmailMailboxes,
  INTAKE_EMAIL_MAILBOXES,
} from './booking-intake';
import type { Database } from './db';
import { looksLikeBookingRelatedEmail } from './booking-message-detect';
import {
  intakeDraftHasAttachmentShape,
  intakeDraftHasMinimumShape,
} from './intake-email-hints';
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
  /** Optional per-PDF extracts (passenger receipts) — one draft each when present. */
  pdf_sections?: Array<{ filename: string; text: string }>;
};

export type EmailPollResult = {
  mailbox: string;
  scanned: number;
  created: Array<{
    id: string;
    title: string;
    message_id: string;
    subject?: string;
    live_booking?: boolean;
    booking_id?: string;
    booking_code?: string;
    ai_summary?: string;
    intake_tags?: string[];
    intake_confidence?: string;
    intake_missing?: string[];
    owner_alert_text?: string;
  }>;
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
      ? 'OAuth env present. Poll → drafts (+ high-confidence live). Pattern before AI; cron skips LLM near timeout. Never invents money.'
      : 'Automatic mailbox poll is not configured. Connect Shmuel@ / mindy@ / bookings@ via hosted OAuth, see docs/EMAIL_INTAKE_OAUTH.md.',
  };
}

/** Build a draft payload from an inbound email. Does not write to the database. */
export async function prepareEmailIntakeDraft(message: InboundEmailMessage) {
  const drafts = await prepareEmailIntakeDrafts(message);
  return drafts[0];
}

/**
 * Prefer scanned attachments (PDF / confirmation images) for every booking pattern
 * (Amex, United, Capital One, Chase, Etihad, hotels, …). One draft per useful file.
 * Falls back to the email body when no attachment yields booking fields.
 * Never invents sale amounts.
 */
export async function prepareEmailIntakeDrafts(
  message: InboundEmailMessage,
  opts?: { skipAi?: boolean },
) {
  const mailbox = assertAllowedIntakeMailbox(message.mailbox);
  const probe = [message.subject, message.text, ...(message.pdf_sections || []).map((p) => p.text)]
    .filter(Boolean)
    .join('\n');
  if (!probe.trim()) throw new Error('Email intake requires message text');
  if (
    !looksLikeBookingRelatedEmail({
      subject: message.subject,
      text: probe,
      from_address: message.from_address,
    })
  ) {
    throw new Error(
      'Email does not look like a booking/reservation; draft not created (unrelated skipped)',
    );
  }

  const skipAi = Boolean(opts?.skipAi);
  // Ignore tiny/garbage extracts (subject-only PNR spam). Need real file body text.
  const sections = (message.pdf_sections || []).filter((p) => p.text && p.text.trim().length >= 40);
  if (sections.length >= 1) {
    const built = await Promise.all(
      sections.map(async (file, index) => {
        // Parse the attachment alone first — do not let email subject invent empty drafts.
        const fromFile = await buildIntakeDraft({
          source: 'email',
          text: file.text,
          mailbox,
          fromAddress: message.from_address,
          subject: undefined,
          receivedAt: message.received_at,
          filename: message.message_id
            ? `email:${message.message_id}:${index}`
            : `file:${file.filename}`,
          mimeType: /\.pdf$/i.test(file.filename) ? 'application/pdf' : 'text/plain',
          entryIndex: index,
          entryCount: sections.length,
          skipAi,
        });
        if (
          !intakeDraftHasAttachmentShape({
            entry: fromFile.entry as Record<string, unknown>,
            recognized_fields: fromFile.recognized_fields,
          })
        ) {
          return null;
        }
        // Keep provenance subject on the saved draft after the file itself proved useful.
        return buildIntakeDraft({
          source: 'email',
          text: file.text,
          mailbox,
          fromAddress: message.from_address,
          subject: message.subject,
          receivedAt: message.received_at,
          filename: message.message_id
            ? `email:${message.message_id}:${index}`
            : `file:${file.filename}`,
          mimeType: /\.pdf$/i.test(file.filename) ? 'application/pdf' : 'text/plain',
          entryIndex: index,
          entryCount: sections.length,
          skipAi,
        });
      }),
    );
    const shaped = built.filter((b): b is NonNullable<typeof b> => Boolean(b));
    if (shaped.length) return shaped;
  }

  // Subject-only / empty body but booking-related: still capture (Phase 4 parity).
  const bodyText =
    message.text?.trim() ||
    [
      message.subject ? `Subject: ${message.subject}` : '',
      'Notes: Email body empty or unread, draft kept for human review. Do not invent money.',
    ]
      .filter(Boolean)
      .join('\n');
  return [
    await buildIntakeDraft({
      source: 'email',
      text: bodyText,
      mailbox,
      fromAddress: message.from_address,
      subject: message.subject,
      receivedAt: message.received_at,
      filename: message.message_id ? `email:${message.message_id}` : undefined,
      mimeType: 'message/rfc822',
      skipAi,
    }),
  ];
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
  // Soft-deleted drafts (booking_draft_delete) do not block a fresh poll.
  const row = (
    await db.query(
      `SELECT d.id FROM booking_drafts d
       WHERE (
           entry->'intake_provenance'->>'filename' = $1
           OR entry->'intake_provenance'->>'filename' LIKE $2
         )
         AND NOT EXISTS(
           SELECT 1 FROM commands c
           WHERE c.kind='booking_draft_delete' AND c.result IS NOT NULL
             AND c.payload->>'draft_id'=d.id::text
         )
       LIMIT 1`,
      [filename, `${filename}:%`],
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
 * Poll allow-listed mailboxes for unread booking-related mail → draft (+ optional live promote).
 * Idempotent on Gmail message id. Never invents money.
 */
export async function pollEmailIntakeMailboxes(
  db: Database,
  opts?: {
    actor?: Actor | null;
    mailboxes?: string[];
    maxPerMailbox?: number;
    markRead?: boolean;
    dryRun?: boolean;
    /** Soft deadline (ms since epoch). Stop starting new messages when exceeded. */
    deadlineAt?: number;
    /** Max PDF/image files to extract per message (cron free = 30s → keep low). */
    maxAttachments?: number;
  },
): Promise<{
  results: EmailPollResult[];
  intake: ReturnType<typeof emailIntakeStatus>;
  owner_alerts: string[];
  live_booking_count: number;
  draft_count: number;
}> {
  if (!emailIntakePollingConfigured()) {
    throw new Error('Email intake OAuth is not configured');
  }
  const staff = opts?.actor ?? (await resolveEmailIntakeActor(db, null));
  const boxes = (opts?.mailboxes?.length ? opts.mailboxes : intakeEmailMailboxes()).map((b) =>
    assertAllowedIntakeMailbox(b),
  );
  const maxPerMailbox = Math.min(Math.max(opts?.maxPerMailbox ?? 5, 1), 15);
  const maxAttachments = Math.min(Math.max(opts?.maxAttachments ?? 3, 0), 5);
  const markRead = opts?.markRead !== false;
  const dryRun = Boolean(opts?.dryRun);
  const deadlineAt = opts?.deadlineAt;
  const results: EmailPollResult[] = [];
  const owner_alerts: string[] = [];
  let live_booking_count = 0;
  let draft_count = 0;
  const pastDeadline = () => Boolean(deadlineAt && Date.now() >= deadlineAt);
  /** Leave headroom for DB writes — skip LLM when under ~8s remain. */
  const preferRulesOnly = () =>
    Boolean(deadlineAt && deadlineAt - Date.now() < 8_000);

  for (const mailbox of boxes) {
    if (pastDeadline()) {
      results.push({
        mailbox,
        scanned: 0,
        created: [],
        skipped: [
          {
            message_id: '—',
            reason: 'time_budget_exceeded',
            subject: 'Stopped early so cron-job.org 30s timeout is not hit',
          },
        ],
        errors: [],
      });
      continue;
    }
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
          subject: 'Alias mailbox, mail is read via the primary Google inbox',
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
        if (pastDeadline()) {
          result.skipped.push({
            message_id: item.id,
            reason: 'time_budget_exceeded',
            subject: 'Remaining unread left for the next cron run',
          });
          continue;
        }
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
          const msg = await fetchGmailMessage(token.access_token, item.id, {
            maxFiles: maxAttachments,
          });
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
          const drafts = await prepareEmailIntakeDrafts(
            {
              mailbox,
              from_address: msg.from_address,
              subject: msg.subject,
              text: msg.text || '',
              received_at: msg.received_at,
              message_id: msg.id,
              pdf_sections: msg.pdf_sections,
            },
            { skipAi: preferRulesOnly() },
          );
          const shaped = drafts.filter((built) =>
            intakeDraftHasMinimumShape({
              entry: built.entry as Record<string, unknown>,
              recognized_fields: built.recognized_fields,
            }),
          );
          // Phase 1: booking-related mail always keeps at least one draft (no silent drop).
          const toSave =
            shaped.length > 0
              ? shaped
              : drafts.length > 0
                ? drafts
                : [
                    await buildIntakeDraft({
                      source: 'email',
                      text: msg.text,
                      subject: msg.subject,
                      fromAddress: msg.from_address,
                      mailbox,
                      receivedAt: msg.received_at,
                      filename: `email:${msg.id}`,
                    }),
                  ];
          if (!shaped.length) {
            for (const built of toSave) {
              built.issues = [
                ...(built.issues || []),
                'Low field recognition, draft kept for human review (no silent drop)',
              ];
            }
          }
          if (dryRun) {
            for (const built of toSave) {
              result.created.push({
                id: 'dry-run',
                title: built.title || msg.subject || 'Email intake dry-run',
                message_id: item.id,
                subject: msg.subject,
              });
            }
            continue;
          }
          const { afterIntakeDraftSaved } = await import('./intake-after-save');
          for (const built of toSave) {
            const saved = await execute(db, staff, {
              id: crypto.randomUUID(),
              kind: 'booking_draft',
              data: { title: built.title, entry: built.entry },
            });
            const after = await afterIntakeDraftSaved(db, staff, String(saved.id), built, {
              channel: 'email',
              chat_or_mailbox: mailbox || msg.from_address || msg.subject,
            });
            const promote = after.promote;
            draft_count += 1;
            if (promote.live) live_booking_count += 1;
            if (after.owner_alert_text) owner_alerts.push(after.owner_alert_text);
            result.created.push({
              id: String(saved.id),
              title: built.title,
              message_id: msg.id,
              subject: msg.subject,
              live_booking: promote.live,
              booking_id: promote.live ? promote.booking_id : undefined,
              booking_code: promote.live ? promote.booking_code : undefined,
              ai_summary: promote.summary,
              intake_tags: after.capture.tags,
              intake_confidence: after.capture.confidence,
              intake_missing: after.capture.missing,
              owner_alert_text: after.owner_alert_text || undefined,
            });
          }
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

  return {
    results,
    intake: emailIntakeStatus(),
    owner_alerts: owner_alerts.slice(0, 20),
    live_booking_count,
    draft_count,
  };
}
