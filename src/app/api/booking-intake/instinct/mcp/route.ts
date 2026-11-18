import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import {
  assertInstinctAuth,
  handleInstinctMcp,
  readInstinctAuthHeader,
} from '@/lib/instinct-intake';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Padova-Instinct, X-Requested-With, Accept',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Instinct Settings → MCP connections points here (not the Connectors list). */
export async function GET(request: Request) {
  try {
    const token = readInstinctAuthHeader(request);
    assertInstinctAuth(token);
    return NextResponse.json(
      {
        name: 'padova-instinct',
        transport: 'json-rpc',
        draft_only: true,
        posts_money: false,
        tools: ['padova_instinct_status', 'padova_create_booking_draft'],
        note: 'POST JSON-RPC (initialize / tools/list / tools/call) with Authorization: Bearer <PADOVA_INSTINCT_TOKEN>',
      },
      { headers: CORS },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unauthorized' },
      { status: e instanceof AccessError ? e.status : 401, headers: CORS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = readInstinctAuthHeader(request);
    assertInstinctAuth(token);
    const body = await request.json();
    const out = await handleInstinctMcp(
      await database(),
      `Bearer ${token}`,
      body,
    );
    if (out === null) return new NextResponse(null, { status: 204, headers: CORS });
    return NextResponse.json(out, { headers: CORS });
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'Instinct MCP failed',
    );
    console.error(message);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: databaseUnavailable(e) ? -32001 : -32000,
          message: databaseUnavailable(e) ? temporarilyUnavailable : message,
        },
      },
      {
        status: databaseUnavailable(e)
          ? 503
          : message.includes('authorization rejected')
            ? 403
            : 400,
        headers: CORS,
      },
    );
  }
}
