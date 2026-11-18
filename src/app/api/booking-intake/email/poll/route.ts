import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import {
  assertEmailPollAuth,
  emailIntakeStatus,
  isAuthorizedEmailPollRequest,
  pollEmailIntakeMailboxes,
  readEmailPollAuthHeader,
} from '@/lib/email-intake';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

/** Allow enough time for Gmail + a few digital PDF text extracts (cron-job.org / Vercel). */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function pollJson(out: Awaited<ReturnType<typeof pollEmailIntakeMailboxes>>) {
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
}

function pollError(e: unknown) {
  const message = redactOperationalText(e instanceof Error ? e.message : 'Email poll failed');
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

/**
 * Poll allow-listed mailboxes → booking_draft only.
 * Auth: staff session OR Bearer cron secret / x-padova-email-poll / Vercel CRON_SECRET.
 * Never posts money / never live booking.
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

    return pollJson(out);
  } catch (e) {
    return pollError(e);
  }
}

/**
 * GET: staff → status. Vercel Cron / cron Bearer → run poll (auto-fetch).
 * Query `?status=1` forces status even with cron auth.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusOnly = url.searchParams.get('status') === '1';
    const cronOk = isAuthorizedEmailPollRequest(request);
    const actor = await currentActor();

    if (!actor && !cronOk) throw new AccessError('Sign in required', 401);

    if (statusOnly || (actor && !cronOk)) {
      return NextResponse.json(emailIntakeStatus(), { headers: { 'Cache-Control': 'no-store' } });
    }

    // Auto poll (Vercel Cron or Bearer cron secret on GET).
    // cron-job.org free plan max timeout = 30s — finish early; leftover unread stays for next run.
    const out = await pollEmailIntakeMailboxes(await database(), {
      actor: actor ?? null,
      maxPerMailbox: 2,
      maxAttachments: 2,
      markRead: true,
      dryRun: false,
      deadlineAt: Date.now() + 22_000,
    });
    return pollJson(out);
  } catch (e) {
    if (e instanceof AccessError || (e instanceof Error && e.message.includes('authorization'))) {
      return NextResponse.json(
        {
          error:
            e instanceof AccessError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'Unable to read email poll status',
        },
        { status: e instanceof AccessError ? e.status : 403 },
      );
    }
    return pollError(e);
  }
}
