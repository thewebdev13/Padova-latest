import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { listHotelDirectory, saveHotelDirectory } from '@/lib/hotel-directory';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    const p = new URL(request.url).searchParams;
    const result = await listHotelDirectory(await database(), actor, {
      q: p.get('q') ?? undefined,
      location: p.get('location') ?? undefined,
      includeArchived: p.get('archived') === '1',
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = redactOperationalText(e instanceof Error ? e.message : 'Hotel directory failed');
    return NextResponse.json(
      { error: databaseUnavailable(e) ? temporarilyUnavailable : message },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.startsWith('Permission required:')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const hotel = await saveHotelDirectory(await database(), actor, await readJSON(request));
    return NextResponse.json({ hotel }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = redactOperationalText(e instanceof Error ? e.message : 'Hotel save failed');
    return NextResponse.json(
      { error: databaseUnavailable(e) ? temporarilyUnavailable : message },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.startsWith('Permission required:')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
