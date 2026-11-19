import type { Database } from './db';
import type { Actor } from './permissions';
import { maybePromoteIntakeToLiveBooking, type PromoteResult } from './ai-intake-promote';
import type { BuiltIntakeDraft } from './booking-intake';

/** After booking_draft insert: optional Claude auto-live (Owner 1B). */
export async function afterIntakeDraftSaved(
  db: Database,
  actor: Actor,
  draftId: string,
  built: BuiltIntakeDraft,
): Promise<PromoteResult> {
  return maybePromoteIntakeToLiveBooking(db, actor, {
    draft_id: draftId,
    title: built.title,
    entry: built.entry,
    issues: built.issues,
  });
}
