import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import {
  AccessError,
  listUsers,
  createUser,
  updateUser,
  issueRecovery,
  changePassword,
  regeneratePersonalCodes,
} from '@/lib/users';
export const dynamic = 'force-dynamic';
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  try {
    return NextResponse.json(await listUsers(await database(), actor), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  try {
    validateOrigin(request);
    const { action, ...data } = await readJSON(request, 16000);
    const db = await database();
    let result;
    if (action === 'create') result = await createUser(db, actor, data);
    else if (action === 'update') result = await updateUser(db, actor, data);
    else if (action === 'recovery') result = await issueRecovery(db, actor, data.id);
    else if (action === 'change_password') result = await changePassword(db, actor, data);
    else if (action === 'recovery_codes') result = await regeneratePersonalCodes(db, actor, data);
    else throw new AccessError('Unknown action', 400);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof AccessError
          ? e.message
          : 'Unable to update user. Check the fields and ensure the email is unique.',
    },
    {
      status:
        e instanceof AccessError
          ? e.status
          : e instanceof Error && e.message.startsWith('Permission required:')
            ? 403
            : 400,
    },
  );
}
