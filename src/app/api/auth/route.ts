import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { database } from '@/lib/db';
import { validateOrigin } from '@/lib/auth';
import { readJSON } from '@/lib/http';
import { login, logout, AccessError } from '@/lib/users';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
export async function POST(request: Request) {
  try {
    validateOrigin(request);
    const result = await login(await database(), await readJSON(request, 4096));
    (await cookies()).set('padova_session', result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.PADOVA_QA === '1' || new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 28800,
    });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : databaseUnavailable(e)
              ? temporarilyUnavailable
              : 'Unable to sign in. Check your credentials.',
      },
      { status: e instanceof AccessError ? e.status : databaseUnavailable(e) ? 503 : 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    validateOrigin(request);
    const c = await cookies(),
      token = c.get('padova_session')?.value;
    if (token) await logout(await database(), token);
    c.delete('padova_session');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Request rejected' }, { status: 400 });
  }
}
