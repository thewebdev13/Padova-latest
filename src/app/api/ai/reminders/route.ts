import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { collectOpsReminders } from '@/lib/ai-ops-reminders';
import { aiIntakeStatus } from '@/lib/claude-intake';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

/**
 * Ops radar / reminders for Owner (Phase 3).
 * DB facts only — missing sale, unpaid, due-tomorrow commissions, open drafts.
 * WhatsApp push waits on third-party provider (Phase 4).
 */
export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const reminders = await collectOpsReminders(await database(), actor);
    return NextResponse.json(
      { ...reminders, ai: aiIntakeStatus(), whatsapp_push: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'Unable to load reminders',
    );
    return NextResponse.json(
      {
        error: databaseUnavailable(e) ? temporarilyUnavailable : message,
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
