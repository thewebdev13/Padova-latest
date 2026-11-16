import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { registerClient } from '@/lib/partnerships/oauth';
import { z } from 'zod';
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await registerClient(await database(), await readJSON(request, 10000)),
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.warn(
      'Partnership OAuth client registration rejected',
      error instanceof z.ZodError
        ? error.issues.map((i) => ({ path: i.path, code: i.code }))
        : error instanceof Error &&
            error.message === 'Callback is not in the owner-configured redirect allowlist'
          ? 'callback_not_allowlisted'
          : 'invalid_metadata',
    );
    return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 });
  }
}
