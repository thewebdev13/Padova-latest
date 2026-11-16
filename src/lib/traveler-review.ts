import { createHash } from 'node:crypto';
import type { Row, SQL } from './db';

/** A locator plus the captured text identifies a claim, never a person's identity. */
export function travelerSourceKey(source: Row) {
  const claim = [source.workbook_id, source.tab, source.row, source.column, source.raw_text];
  return `traveler-cell:${createHash('sha256').update(JSON.stringify(claim)).digest('hex')}`;
}

export function travelerReviewRows(held: Row[], events: Row[]) {
  const latest = new Map<string, Row>();
  for (const event of events) {
    const prior = latest.get(event.source_key);
    if (!prior || `${event.created_at}:${event.id}` > `${prior.created_at}:${prior.id}`)
      latest.set(event.source_key, event);
  }
  return held.map((r) => {
    const source_key = travelerSourceKey(r.source);
    return { ...r, source_key, decision: latest.get(source_key) ?? null };
  });
}

export async function validateTravelerDecision(tx: SQL, actor: { role?: string }, data: Row) {
  if (!data.source_key.startsWith('traveler-cell:')) return;
  if (actor.role !== 'OWNER')
    throw new Error('Traveler source decisions require an individual Owner');
  const source = data.source_locator;
  if (travelerSourceKey(source) !== data.source_key)
    throw new Error('Traveler source locator does not match its captured claim');
  if (!['Accept', 'Not Same', 'Unsure'].includes(data.proposed_mapping?.action))
    throw new Error('Select Accept, Not Same or Unsure');
  const action = data.proposed_mapping.action;
  if (
    data.status !== (action === 'Accept' ? 'Resolved' : action === 'Not Same' ? 'Rejected' : 'Held')
  )
    throw new Error('Traveler decision status does not match its action');
  const ids = data.destination_ids?.traveler_ids;
  if (
    !Array.isArray(ids) ||
    (action !== 'Unsure' && !ids.length) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Select the distinct travelers this decision concerns');
  for (const id of ids) {
    const person = (await tx.query('SELECT * FROM parties WHERE id=$1', [id])).rows[0];
    if (
      !person ||
      person.archived_at ||
      person.kind !== 'person' ||
      !person.roles.includes('traveler') ||
      person.details?.traveler_review_only
    )
      throw new Error('Decision destinations must be active eligible travelers');
  }
}
