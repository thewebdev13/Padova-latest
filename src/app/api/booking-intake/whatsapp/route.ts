import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import type { Actor } from '@/lib/permissions';
import { AccessError } from '@/lib/users';
import {
  assertWhatsAppBridgeAuth,
  prepareWhatsAppIntakeDraft,
  whatsappIntakeStatus,
} from '@/lib/whatsapp-intake';
import { afterIntakeDraftSaved } from '@/lib/intake-after-save';
import { aiIntakeStatus } from '@/lib/claude-intake';

export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    const bridge = request.headers.get('x-padova-wa-bridge');
    if (!actor && !bridge) throw new AccessError('Sign in required', 401);
    if (!actor && bridge) assertWhatsAppBridgeAuth(bridge);
    return NextResponse.json(whatsappIntakeStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Unable to read WhatsApp intake status',
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}

/**
 * Incoming WhatsApp text → booking_draft (read-only bridge).
 * Auth: individual staff session OR Owner-PC bridge token header `x-padova-wa-bridge`.
 * Never sends WhatsApp; never posts money.
 */
export async function POST(request: Request) {
  try {
    const bridge = request.headers.get('x-padova-wa-bridge');
    const actor = await currentActor();
    if (bridge) assertWhatsAppBridgeAuth(bridge);
    else {
      if (!actor) throw new AccessError('Sign in required', 401);
      validateOrigin(request);
    }
    if (!actor && !bridge) throw new AccessError('Sign in required', 401);

    const body = await readJSON(request);
    let bytes: Buffer | undefined;
    if (body.file_base64) {
      const raw = String(body.file_base64);
      const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
      bytes = Buffer.from(b64, 'base64');
      if (bytes.length > 10 * 1024 * 1024) throw new Error('WhatsApp file must be 10 MB or smaller');
    }
    const built = await prepareWhatsAppIntakeDraft({
      session_label: body.session_label ? String(body.session_label) : undefined,
      chat_name: body.chat_name ? String(body.chat_name) : undefined,
      from_number: body.from_number ? String(body.from_number) : undefined,
      text: String(body.text || ''),
      received_at: body.received_at ? String(body.received_at) : undefined,
      message_id: body.message_id ? String(body.message_id) : undefined,
      bytes,
      filename: body.filename ? String(body.filename) : undefined,
      mimeType: body.mime_type ? String(body.mime_type) : undefined,
    });

    // Bridge posts without a browser session: attribute draft to an active staff actor.
    let staff: Actor | null = actor;
    if (!staff) {
      if (!body.actor_id) throw new Error('WhatsApp bridge posts require actor_id of staff user');
      const row = (
        await (
          await database()
        ).query(
          'SELECT id, name, role, permissions FROM staff WHERE id=$1 AND active=true',
          [String(body.actor_id)],
        )
      ).rows[0];
      if (!row) throw new Error('Bridge actor_id must be an active staff user');
      staff = {
        id: row.id,
        name: row.name,
        role: row.role,
        permissions: row.permissions ?? [],
      };
    }

    const commandId = String(body.command_id || crypto.randomUUID());
    const db = await database();
    const result = await execute(db, staff, {
      id: commandId,
      kind: 'booking_draft',
      data: { title: built.title, entry: built.entry },
    });
    const promote = await afterIntakeDraftSaved(db, staff, String(result.id), built);
    return NextResponse.json(
      {
        id: result.id,
        title: built.title,
        issues: built.issues,
        recognized_fields: built.recognized_fields,
        draft: true,
        posted: false,
        posts_money: false,
        sent: false,
        live_booking: promote.live,
        booking_id: promote.live ? promote.booking_id : undefined,
        booking_code: promote.live ? promote.booking_code : undefined,
        ai_summary: promote.summary,
        ai_promote_reason: promote.live ? undefined : promote.reason,
        intake: whatsappIntakeStatus(),
        ai: aiIntakeStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'WhatsApp intake failed',
    );
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
            : message.startsWith('Permission required:') || message.includes('authorization rejected')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
