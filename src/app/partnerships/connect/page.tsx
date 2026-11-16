import { currentActor } from '@/lib/auth';
import { database } from '@/lib/db';
import { partnershipActor } from '@/lib/partnerships/service';
import { requirePermission } from '@/lib/permissions';
import { consentDetails, resource } from '@/lib/partnerships/oauth';
import Connection, { ConnectionSignIn } from '@/components/partnerships/connect';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await currentActor();
  if (!actor)
    return (
      <ConnectionSignIn synthetic={process.env.PADOVA_QA === '1' || !process.env.DATABASE_URL} />
    );
  try {
    const db = await database();
    await partnershipActor(db, actor);
    requirePermission(actor, 'manage_partnership_ai');
    const p = await searchParams;
    const grants = (
      await db.query(
        'SELECT id,scopes,expires_at,revoked_at,last_used_at FROM pt_ai_grants WHERE staff_id=$1 ORDER BY created_at DESC',
        [actor.id],
      )
    ).rows;
    let endpoint = '',
      error = '',
      consent = null;
    try {
      endpoint = resource();
      if (p.client_id) consent = await consentDetails(db, actor, p);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection unavailable';
    }
    return (
      <Connection
        data={{ actor: { name: actor.name }, resource: endpoint, error, consent, grants }}
      />
    );
  } catch {
    return (
      <main>
        <h1>Connection access unavailable</h1>
        <p>Your individual staff account needs partnership read and connection permissions.</p>
        <a href="/">Return to Padova</a>
      </main>
    );
  }
}
