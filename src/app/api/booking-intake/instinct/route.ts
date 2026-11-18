import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import {
  assertInstinctAuth,
  instinctIntakeStatus,
  prepareInstinctIntakeDraft,
  readInstinctAuthHeader,
  resolveInstinctActor,
} from '@/lib/instinct-intake';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Padova-Instinct, X-Requested-With',
  'Cache-Control': 'no-store',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  try {
    const token = readInstinctAuthHeader(request);
    const actor = await currentActor();
    if (!actor && !token) throw new AccessError('Sign in required', 401);
    if (!actor && token) assertInstinctAuth(token);
    return json(instinctIntakeStatus());
  } catch (e) {
    return json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Unable to read Instinct intake status',
      },
      e instanceof AccessError ? e.status : 400,
    );
  }
}

/**
 * Instinct agent → booking_draft only.
 * Auth: staff session OR `Authorization: Bearer <PADOVA_INSTINCT_TOKEN>` /
 * `x-padova-instinct`. Never posts money; never sends WhatsApp.
 */
export async function POST(request: Request) {
  try {
    const token = readInstinctAuthHeader(request);
    const actor = await currentActor();
    if (token) assertInstinctAuth(token);
    else {
      if (!actor) throw new AccessError('Sign in required', 401);
      validateOrigin(request);
    }
    if (!actor && !token) throw new AccessError('Sign in required', 401);

    const body = await readJSON(request);
    const built = await prepareInstinctIntakeDraft({
      chat_name: body.chat_name ? String(body.chat_name) : undefined,
      from_number: body.from_number ? String(body.from_number) : undefined,
      text: String(body.text || ''),
      received_at: body.received_at ? String(body.received_at) : undefined,
      message_id: body.message_id ? String(body.message_id) : undefined,
      title: body.title ? String(body.title) : undefined,
    });

    const staff =
      actor ??
      (await resolveInstinctActor(
        await database(),
        body.actor_id ? String(body.actor_id) : null,
      ));

    const commandId = String(body.command_id || crypto.randomUUID());
    const result = await execute(await database(), staff, {
      id: commandId,
      kind: 'booking_draft',
      data: { title: built.title, entry: built.entry },
    });

    return json({
      id: result.id,
      title: built.title,
      issues: built.issues,
      recognized_fields: built.recognized_fields,
      draft: true,
      posted: false,
      live_booking: false,
      posts_money: false,
      sent: false,
      review_url_hint: '/?draft=' + encodeURIComponent(String(result.id)),
      intake: instinctIntakeStatus(),
    });
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'Instinct intake failed',
    );
    console.error(message);
    return json(
      {
        error: databaseUnavailable(e)
          ? temporarilyUnavailable
          : message.includes('violates')
            ? 'Operation conflicts with an existing record or database constraint'
            : message,
        draft: true,
        posted: false,
      },
      e instanceof AccessError
        ? e.status
        : message.startsWith('Permission required:') || message.includes('authorization rejected')
          ? 403
          : databaseUnavailable(e)
            ? 503
            : 400,
    );
  }
}
