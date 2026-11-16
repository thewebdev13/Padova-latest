import { z } from 'zod';
import { one, type SQL, type Row } from './db';
import type { Actor } from './permissions';
import { sourceFingerprint } from './historical-delta';
import { historicalRecordPresentation } from './historical-record-presentation';

const amount = z.number().int().min(0).max(9_000_000_000_000).nullable();
export const historicalDraftFacts = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    booked_on: z.iso.date().nullable(),
    date_certainty: z.enum(['Confirmed', 'Approximate', 'Unknown']),
    sale_cents: amount,
    cost_cents: amount,
    notes: z.string().trim().max(2000),
    traveler_names: z.string().trim().max(2000).optional(),
    travel_details: z.string().trim().max(2000).optional(),
    travel_dates: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.booked_on === null) !== (v.date_certainty === 'Unknown'))
      ctx.addIssue({
        code: 'custom',
        message: 'Choose Unknown with no date, or supply a confirmed/approximate date.',
      });
  });

export async function historicalDraftReview(db: SQL, draft: Row) {
  const events = (
    await db.query(
      'SELECT r.*,s.name actor_name FROM review_resolution_events r LEFT JOIN staff s ON s.id::text=r.actor WHERE r.source_key=$1 ORDER BY r.created_at DESC,r.id DESC',
      [`historical-draft:${draft.id}`],
    )
  ).rows;
  const saved = events.find((e) => e.proposed_mapping?.format === 'historical-draft-facts-v1');
  const presentation = historicalRecordPresentation(draft.entry);
  const initial = {
    summary: presentation.route
      ? `Flight · ${presentation.route}`
      : draft.entry.summary || draft.title,
    booked_on: draft.entry.booked_on || null,
    date_certainty: draft.entry.booked_on ? 'Confirmed' : 'Unknown',
    sale_cents: typeof draft.entry.sale === 'number' ? draft.entry.sale : null,
    cost_cents: null,
    notes: '',
    traveler_names: presentation.travelers,
    travel_details: presentation.route,
    travel_dates: presentation.travelDates,
  };
  return {
    values: saved ? historicalDraftFacts.parse(saved.proposed_mapping.facts) : initial,
    fingerprint: sourceFingerprint({ entry: draft.entry, latest: saved?.id ?? null }),
    events,
  };
}

/** Append facts only. Never turn a review into a receipt, cost or sale posting. */
export async function validateHistoricalDraftReview(db: SQL, actor: Actor, data: Row) {
  if (!data.source_key.startsWith('historical-draft:')) return;
  if (actor.role !== 'OWNER') throw new Error('Only the Owner can correct historical records.');
  const draftId = z.string().uuid().parse(data.source_key.slice('historical-draft:'.length));
  // Drafts are append-only. Serialize corrections without granting UPDATE on their source table.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [data.source_key]);
  const draft = await one(
    db,
    'SELECT id,title,entry FROM booking_drafts WHERE id=$1 AND created_by=$2',
    [draftId, actor.id],
  );
  if (!draft.entry?.itinerary?.historical_reconciliation_status)
    throw new Error('This is not a held historical record.');
  if (data.status !== 'Proposed' || data.proposed_mapping?.format !== 'historical-draft-facts-v1')
    throw new Error('Historical corrections remain pending reconciliation.');
  const current = await historicalDraftReview(db, draft);
  if (current.fingerprint !== data.proposed_mapping.fingerprint)
    throw new Error('This record changed. Reopen it before saving your correction.');
  data.proposed_mapping.facts = historicalDraftFacts.parse(data.proposed_mapping.facts);
  data.source_locator = { draft_id: draftId };
  data.destination_ids = {};
}
