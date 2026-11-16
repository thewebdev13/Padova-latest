import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { listQAIssues, submitQAIssue } from '@/lib/qa';
import { AccessError } from '@/lib/users';
export const dynamic = 'force-dynamic';
async function handle(request?: Request) {
  if (process.env.PADOVA_QA !== '1')
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  try {
    if (request) validateOrigin(request);
    const db = await database();
    const result = request
      ? await submitQAIssue(db, actor, await readJSON(request, 16000))
      : await listQAIssues(db, actor);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AccessError ? error.message : 'Check the report fields' },
      { status: error instanceof AccessError ? error.status : 400 },
    );
  }
}
export async function GET() {
  return handle();
}
export async function POST(request: Request) {
  return handle(request);
}
