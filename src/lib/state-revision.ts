import { createHash } from 'node:crypto';
import type { Database } from './db';
import type { Actor } from './permissions';
import { requirePermission } from './permissions';
import { freshActor } from './users';
import { businessDate } from './business-date';

/** Change notification only: never caches balances or skips command authorization. */
export async function stateRevision(db: Database, actor: Actor) {
  actor = await freshActor(db, actor);
  requirePermission(actor, 'operations');
  const changes = (
    await db.query(`SELECT
    (SELECT count(*)::text FROM audit_events) audit_count,
    (SELECT max(created_at)::text FROM audit_events) audit_latest,
    (SELECT count(*)::text FROM commands WHERE result IS NOT NULL) command_count,
    (SELECT max(created_at)::text FROM security_audit) security_latest`)
  ).rows[0];
  return createHash('sha256')
    .update(JSON.stringify([actor, changes, await businessDate(db)]))
    .digest('hex');
}
