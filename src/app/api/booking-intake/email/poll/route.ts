import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import {
  assertEmailPollAuth,
  emailIntakeStatus,
  pollEmailIntakeMailboxes,
  readEmailPollAuthHeader,
} from '@/lib/email-intake';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

/**
 * Poll Shmuel@ / mindy@ for unread booking-related mail → booking_draft only.
 * Auth: staff session OR `Authorization: Bearer <PADOVA_EMAIL_INTAKE_CRON_SECRET>` /
 * `x-padova-email-poll`. Never posts money / never live booking.
 */
export async function POST(request: Request) {
  try {
    const cron = readEmailPollAuthHeader(request);
    const actor = await currentActor();
    if (cron) assertEmailPollAuth(cron);
    else {
      if (!actor) throw new AccessError('Sign in required', 401);
      validateOrigin(request);
    }
    if (!actor && !cron) throw new AccessError('Sign in required', 401);

    let body: Record<string, unknown> = {};
    try {
      body = await readJSON(request);
    } catch {
      body = {};
    }

    const out = await pollEmailIntakeMailboxes(await database(), {
      actor: actor ?? null,
      mailboxes: Array.isArray(body.mailboxes)
        ? body.mailboxes.map((m) => String(m))
        : undefined,
      maxPerMailbox: body.max_per_mailbox ? Number(body.max_per_mailbox) : undefined,
      markRead: body.mark_read === false ? false : undefined,
      dryRun: body.dry_run === true || body.dry_run === '1',
    });

    return NextResponse.json(
      {
        draft: true,
        posted: false,
        live_booking: false,
        posts_money: false,
        ...out,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'Email poll failed',
    );
    console.error(message);
    return NextResponse.json(
      {
        error: databaseUnavailable(e) ? temporarilyUnavailable : message,
        draft: true,
        posted: false,
        intake: emailIntakeStatus(),
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.includes('authorization rejected')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}

export async function GET(request: Request) {
  try {
    const cron = readEmailPollAuthHeader(request);
    const actor = await currentActor();
    if (!actor && !cron) throw new AccessError('Sign in required', 401);
    if (!actor && cron) assertEmailPollAuth(cron);
    return NextResponse.json(emailIntakeStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Unable to read email poll status',
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
