/**
 * Plan: booking More / detail holds documents (itineraries, screenshots, PDFs).
 * v1 stores link metadata on operational_entry (no binary upload; never invent files).
 * Hide = remove-from-view (append flag); never erase history.
 */

export const BOOKING_DOCUMENT_KINDS = ['itinerary', 'screenshot', 'pdf', 'other'] as const;
export type BookingDocumentKind = (typeof BOOKING_DOCUMENT_KINDS)[number];

export type BookingDocumentLink = {
  id: string;
  label: string;
  kind: BookingDocumentKind;
  url?: string;
  note?: string;
  added_on: string;
  hidden?: boolean;
  hidden_at?: string;
  hidden_reason?: string;
};

type OpLike = Record<string, unknown> | null | undefined;

function asList(raw: unknown): BookingDocumentLink[] {
  if (!Array.isArray(raw)) return [];
  const out: BookingDocumentLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || '').trim();
    const label = String(r.label || '').trim();
    const kind = String(r.kind || '').trim() as BookingDocumentKind;
    const added_on = String(r.added_on || '').trim();
    if (!id || !label) continue;
    if (!(BOOKING_DOCUMENT_KINDS as readonly string[]).includes(kind)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(added_on)) continue;
    const url = String(r.url || '').trim();
    const note = String(r.note || '').trim();
    out.push({
      id,
      label: label.slice(0, 200),
      kind,
      ...(url ? { url: url.slice(0, 2000) } : {}),
      ...(note ? { note: note.slice(0, 2000) } : {}),
      added_on,
      ...(r.hidden ? { hidden: true } : {}),
      ...(r.hidden_at ? { hidden_at: String(r.hidden_at) } : {}),
      ...(r.hidden_reason ? { hidden_reason: String(r.hidden_reason).slice(0, 2000) } : {}),
    });
  }
  return out;
}

export function bookingDocumentLinks(op: OpLike): BookingDocumentLink[] {
  if (!op || typeof op !== 'object') return [];
  return asList((op as Record<string, unknown>).document_links);
}

export function visibleBookingDocuments(op: OpLike): BookingDocumentLink[] {
  return bookingDocumentLinks(op).filter((d) => !d.hidden);
}

export function hiddenBookingDocuments(op: OpLike): BookingDocumentLink[] {
  return bookingDocumentLinks(op).filter((d) => d.hidden);
}

export function bookingDocumentKindLabel(kind: string): string {
  if (kind === 'itinerary') return 'Itinerary';
  if (kind === 'screenshot') return 'Screenshot';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'other') return 'Other';
  return kind;
}

/**
 * Plan More: optional document link on New Booking (link metadata only — no binary).
 * Returns null when blank (never invent a document).
 */
export function normalizeEntryDocumentDraft(input: {
  label?: string | null;
  kind?: string | null;
  url?: string | null;
  note?: string | null;
  added_on?: string | null;
}): {
  label: string;
  kind: BookingDocumentKind;
  url?: string;
  note?: string;
  added_on: string;
} | null {
  const label = String(input.label || '').trim();
  const url = String(input.url || '').trim();
  const note = String(input.note || '').trim();
  if (!label && !url && !note) return null;
  if (!label) throw new Error('Document label is required when adding a link');
  const kindRaw = String(input.kind || 'other').trim().toLowerCase();
  const kind = (BOOKING_DOCUMENT_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as BookingDocumentKind)
    : 'other';
  const added_on = String(input.added_on || '').trim();
  if (added_on && !/^\d{4}-\d{2}-\d{2}$/.test(added_on))
    throw new Error('Document date must be YYYY-MM-DD');
  return {
    label: label.slice(0, 200),
    kind,
    ...(url ? { url: url.slice(0, 2000) } : {}),
    ...(note ? { note: note.slice(0, 2000) } : {}),
    added_on: added_on || new Date().toISOString().slice(0, 10),
  };
}

/** True when More should open because a document draft field is started. */
export function entryDocumentDraftStarted(input: {
  document_label?: string | null;
  document_url?: string | null;
  document_note?: string | null;
}): boolean {
  return Boolean(
    String(input.document_label || '').trim() ||
      String(input.document_url || '').trim() ||
      String(input.document_note || '').trim(),
  );
}

export function appendBookingDocument(
  op: OpLike,
  doc: {
    id: string;
    label: string;
    kind: BookingDocumentKind;
    url?: string;
    note?: string;
    added_on: string;
  },
): Record<string, unknown> {
  const base =
    op && typeof op === 'object' && (op as Record<string, unknown>).version === 1
      ? { ...(op as Record<string, unknown>) }
      : { version: 1 as const, sale_known: true };
  const existing = bookingDocumentLinks(base);
  if (existing.some((d) => d.id === doc.id))
    throw new Error('Document link id already exists on this booking');
  const next: BookingDocumentLink = {
    id: doc.id,
    label: doc.label.trim().slice(0, 200),
    kind: doc.kind,
    added_on: doc.added_on,
    ...(doc.url?.trim() ? { url: doc.url.trim().slice(0, 2000) } : {}),
    ...(doc.note?.trim() ? { note: doc.note.trim().slice(0, 2000) } : {}),
  };
  if (!next.label) throw new Error('Document label is required');
  return { ...base, document_links: [...existing, next] };
}

export function hideBookingDocument(
  op: OpLike,
  documentId: string,
  input: { hidden_at: string; reason: string },
): Record<string, unknown> {
  const base =
    op && typeof op === 'object' && (op as Record<string, unknown>).version === 1
      ? { ...(op as Record<string, unknown>) }
      : { version: 1 as const, sale_known: true };
  const existing = bookingDocumentLinks(base);
  const idx = existing.findIndex((d) => d.id === documentId);
  if (idx < 0) throw new Error('Document link not found on this booking');
  if (existing[idx].hidden) throw new Error('Document link is already hidden');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Hide reason is required');
  const next = existing.map((d, i) =>
    i === idx
      ? {
          ...d,
          hidden: true,
          hidden_at: input.hidden_at,
          hidden_reason: reason.slice(0, 2000),
        }
      : d,
  );
  return { ...base, document_links: next };
}
