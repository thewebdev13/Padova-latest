import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { authorizeClient, issuer } from '@/lib/partnerships/oauth';
export async function GET(request: Request) {
  const target = new URL('/partnerships/connect', issuer());
  target.search = new URL(request.url).search;
  return NextResponse.redirect(target);
}
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    validateOrigin(request);
    return NextResponse.json(
      { redirect: await authorizeClient(await database(), actor, await readJSON(request, 10000)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Authorization request could not be approved' },
      { status: 400 },
    );
  }
}
