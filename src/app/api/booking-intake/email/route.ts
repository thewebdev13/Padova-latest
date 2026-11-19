import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { emailIntakeStatus, prepareEmailIntakeDraft } from '@/lib/email-intake';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';
import { afterIntakeDraftSaved } from '@/lib/intake-after-save';
import { aiIntakeStatus } from '@/lib/claude-intake';

/** Report mailbox allow-list and whether Workspace OAuth poller env is present. */
export async function GET() {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    return NextResponse.json(emailIntakeStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AccessError ? e.message : 'Unable to read intake status' },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}

/**
 * Staff-authenticated email → booking_draft.
 * Live Gmail poll is separate and waits on Owner Workspace OAuth for the two mailboxes.
 * Never posts money.
 */
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const body = await readJSON(request);
    const built = await prepareEmailIntakeDraft({
      mailbox: String(body.mailbox || ''),
      from_address: body.from_address ? String(body.from_address) : undefined,
      subject: body.subject ? String(body.subject) : undefined,
      text: String(body.text || ''),
      received_at: body.received_at ? String(body.received_at) : undefined,
      message_id: body.message_id ? String(body.message_id) : undefined,
    });
    const commandId = String(body.command_id || crypto.randomUUID());
    const db = await database();
    const result = await execute(db, actor, {
      id: commandId,
      kind: 'booking_draft',
      data: { title: built.title, entry: built.entry },
    });
    const promote = await afterIntakeDraftSaved(db, actor, String(result.id), built);
    return NextResponse.json(
      {
        id: result.id,
        title: built.title,
        issues: built.issues,
        recognized_fields: built.recognized_fields,
        draft: true,
        posted: false,
        posts_money: false,
        live_booking: promote.live,
        booking_id: promote.live ? promote.booking_id : undefined,
        booking_code: promote.live ? promote.booking_code : undefined,
        ai_summary: promote.summary,
        ai_promote_reason: promote.live ? undefined : promote.reason,
        intake: emailIntakeStatus(),
        ai: aiIntakeStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(e instanceof Error ? e.message : 'Email intake failed');
    console.error(message);
    return NextResponse.json(
      {
        error: databaseUnavailable(e)
          ? temporarilyUnavailable
          : message.includes('violates')
            ? 'Operation conflicts with an existing record or database constraint'
            : message,
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.startsWith('Permission required:')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
