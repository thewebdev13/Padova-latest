import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { AccessError } from '@/lib/users';
import { handleMcp } from '@/lib/partnerships/mcp';
import { issuer } from '@/lib/partnerships/oauth';
export const dynamic = 'force-dynamic';
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export async function POST(request: Request) {
  let payload: unknown;
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== issuer()) throw new AccessError('Origin rejected');
    payload = await readJSON(request, 250000);
    const result = await handleMcp(await database(), request.headers.get('authorization'), payload);
    return result
      ? NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
      : new Response(null, { status: 202 });
  } catch (e) {
    const status = e instanceof AccessError ? e.status : 400;
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (status === 401) {
      try {
        headers['WWW-Authenticate'] =
          `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource/api/partnerships/mcp"`;
      } catch {}
    }
    if (
      status !== 401 &&
      payload &&
      typeof payload === 'object' &&
      'jsonrpc' in payload &&
      payload.jsonrpc === '2.0' &&
      'id' in payload &&
      (typeof payload.id === 'string' || typeof payload.id === 'number')
    ) {
      const message =
        'Request rejected. Review the current record version, permitted scope and required evidence, then retry with the same command ID only if the input is unchanged.';
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: payload.id,
          ...('method' in payload && payload.method === 'tools/call'
            ? { result: { content: [{ type: 'text', text: message }], isError: true } }
            : { error: { code: -32602, message } }),
        },
        { status: 200, headers },
      );
    }
    return NextResponse.json(
      {
        error:
          status === 401
            ? 'Authentication required'
            : 'Partnership tool request rejected; check permission, version and input.',
      },
      { status, headers },
    );
  }
}
