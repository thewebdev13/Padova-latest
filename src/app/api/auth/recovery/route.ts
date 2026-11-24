import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import {
  requestRecovery,
  completeRecovery,
  recoverWithPersonalCode,
  AccessError,
  logout,
} from '@/lib/users';
export async function POST(request: Request) {
  try {
    validateOrigin(request);
    const { action, ...data } = await readJSON(request, 4096);
    const db = await database();
    const result =
      action === 'reset'
        ? await completeRecovery(db, data)
        : action === 'backup_code'
          ? await recoverWithPersonalCode(db, data)
          : action === 'request'
            ? await requestRecovery(db, data, { publicOrigin: request.url })
            : null;
    if (!result) throw new Error('Invalid action');
    if (action === 'reset' || action === 'backup_code') {
      const c = await cookies(),
        token = c.get('padova_session')?.value;
      if (token) await logout(db, token);
      c.delete('padova_session');
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : 'Unable to process recovery. Check the fields or request a fresh link.',
      },
      { status: 400 },
    );
  }
}
