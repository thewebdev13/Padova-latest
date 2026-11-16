import { NextResponse } from 'next/server';
import { issuer, resource, scopes } from '@/lib/partnerships/oauth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(
      {
        resource: resource(),
        authorization_servers: [issuer()],
        scopes_supported: scopes,
        bearer_methods_supported: ['header'],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Connection is not configured' }, { status: 503 });
  }
}
