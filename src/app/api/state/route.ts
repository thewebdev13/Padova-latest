import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import { database } from '@/lib/db';
import { snapshot, detail } from '@/lib/queries';
import { redactOperationalValue, redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { stateRevision } from '@/lib/state-revision';
import { historicalPreparationIndex } from '@/lib/historical-preparation-store';
import { freshActor } from '@/lib/users';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const url = new URL(request.url);
    const db = await database();
    const revision =
      !url.searchParams.has('id') && !url.searchParams.has('historical')
        ? await stateRevision(db, actor)
        : undefined;
    const result = url.searchParams.has('revision')
      ? { revision }
      : url.searchParams.has('historical')
        ? await historicalPreparationIndex(await freshActor(db, actor), db, {
            search: url.searchParams.get('search') ?? '',
            status: url.searchParams.get('status') ?? 'Prepared booking',
            offset: Number(url.searchParams.get('offset') ?? 0),
          })
        : url.searchParams.has('id')
          ? await detail(db, actor, url.searchParams.get('type') ?? '', url.searchParams.get('id')!)
          : { ...(await snapshot(db, actor)), revision };
    return NextResponse.json(redactOperationalValue(result), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error(redactOperationalText(e instanceof Error ? e.message : 'State read failed'));
    return NextResponse.json(
      { error: databaseUnavailable(e) ? temporarilyUnavailable : 'Unable to load record' },
      { status: databaseUnavailable(e) ? 503 : 400 },
    );
  }
}
