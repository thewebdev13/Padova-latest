import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import { aiIntakeStatus } from '@/lib/claude-intake';
import { AccessError } from '@/lib/users';

/** Server AI intake flags (never returns the API key). */
export async function GET() {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    return NextResponse.json(aiIntakeStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AccessError ? e.message : 'Unable to read AI status' },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
