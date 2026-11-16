import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { revokeGrant } from '@/lib/partnerships/oauth';
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    validateOrigin(request);
    const d = await readJSON(request, 2000);
    return NextResponse.json(await revokeGrant(await database(), actor, d.id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to revoke connection' }, { status: 400 });
  }
}
