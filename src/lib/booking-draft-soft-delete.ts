/**
 * Plan v1 — draft soft-delete is remove-from-view, never erase.
 * Hide iff the latest successful delete/restore command for the draft is delete.
 */

/** SQL fragment: true when draft row alias `d` is currently soft-deleted. */
export const BOOKING_DRAFT_SOFT_DELETED_SQL = `
  COALESCE(
    (
      SELECT c.kind
      FROM commands c
      WHERE c.kind IN ('booking_draft_delete', 'booking_draft_restore')
        AND c.result IS NOT NULL
        AND c.payload->>'draft_id' = d.id::text
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ),
    ''
  ) = 'booking_draft_delete'
`;
