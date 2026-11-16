import { cookies } from 'next/headers';
import { database } from './db';
import { Actor } from './permissions';
import { sessionActor } from './users';

export { verifyPassword, tokenHash } from './credentials';
import { tokenHash } from './credentials';
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get('padova_session')?.value;
  if (!token) return null;
  const db = await database();
  return sessionActor(db, token);
}
export function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('host');
  if (!origin || new URL(origin).host !== forwardedHost) throw new Error('Request origin rejected');
}
