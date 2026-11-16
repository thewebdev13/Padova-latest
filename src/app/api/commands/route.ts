import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import { AccessError } from '@/lib/users';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    validateOrigin(request);
    const result = await execute(await database(), actor, await readJSON(request));
    // Command internals may contain derived cost basis even when the actor may not view it.
    return NextResponse.json({
      result: { id: result.id, ...(result.code ? { code: result.code } : {}) },
    });
  } catch (e) {
    const message = redactOperationalText(e instanceof Error ? e.message : 'Command failed');
    console.error(message);
    return NextResponse.json(
      {
        error: databaseUnavailable(e)
          ? temporarilyUnavailable
          : message.includes('violates')
            ? 'Operation conflicts with an existing record or database constraint'
            : message,
      },
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
