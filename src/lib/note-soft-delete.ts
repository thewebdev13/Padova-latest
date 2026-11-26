/**
 * Plan v1 — note soft-delete is remove-from-view, never erase.
 * Hide iff the latest successful hide/restore command for the note is hide.
 * Cloud padova.notes is SELECT+INSERT only — no UPDATE/DELETE.
 */

/** SQL fragment: true when note row alias `n` is currently soft-hidden. */
export const NOTE_SOFT_DELETED_SQL = `
  COALESCE(
    (
      SELECT c.kind
      FROM commands c
      WHERE c.kind IN ('note_hide', 'note_restore')
        AND c.result IS NOT NULL
        AND c.payload->>'note_id' = n.id::text
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 1
    ),
    ''
  ) = 'note_hide'
`;
