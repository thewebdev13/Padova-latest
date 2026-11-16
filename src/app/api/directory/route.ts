import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import { database } from '@/lib/db';
import { freshActor } from '@/lib/users';
import { requirePermission } from '@/lib/permissions';
import { directoryRoles, type DirectoryRole } from '@/lib/directory-eligibility';
import { redactOperationalValue } from '@/lib/operational-redaction';
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const db = await database();
    requirePermission(await freshActor(db, actor), 'operations');
    const url = new URL(request.url),
      term = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const role =
      url.searchParams.get('role') ??
      (url.searchParams.get('traveler') === 'true' ? 'traveler' : 'customer');
    if (!directoryRoles.includes(role as DirectoryRole))
      return NextResponse.json({ error: 'Choose an eligible directory role' }, { status: 400 });
    const query = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = (
      await db.query(
        `SELECT id,name,kind,roles FROM parties WHERE archived_at IS NULL AND lower(name) LIKE lower($1) AND ($2=ANY(roles) OR ($2='contact' AND kind='person' AND NOT (roles && ARRAY['airline','property','rental']::text[]))) AND COALESCE((details->>'traveler_review_only')::boolean,false)=false AND ($2<>'traveler' OR kind='person') ORDER BY name,id LIMIT 30`,
        [query, role],
      )
    ).rows;
    return NextResponse.json(
      {
        results: redactOperationalValue(
          rows.map((r) => ({ ...r, roles: role === 'contact' ? [] : [role] })),
        ),
        limit: 30,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Directory access denied' }, { status: 403 });
  }
}
