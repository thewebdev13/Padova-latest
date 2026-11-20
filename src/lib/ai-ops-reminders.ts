import type { SQL } from './db';
import { businessDate } from './business-date';
import { requirePermission, type Actor } from './permissions';

export type ReminderItem = {
  kind: string;
  title: string;
  detail?: string;
  booking_id?: string;
  due_on?: string;
  urgency: 'overdue' | 'due_tomorrow' | 'open' | 'missing_info';
};

/**
 * Ops radar from DB facts only (Owner Phase 3).
 * Missing info, Needs Review (unknown sale), unpaid, day-before due, open drafts.
 */
export async function collectOpsReminders(db: SQL, actor: Actor): Promise<{
  as_of: string;
  counts: Record<string, number>;
  items: ReminderItem[];
  plain_summary: string;
}> {
  requirePermission(actor, 'operations');
  const as_of = await businessDate(db);
  const tomorrow = shiftIsoDate(as_of, 1);
  const items: ReminderItem[] = [];

  try {
    const missingSale = (
      await db.query(
        `SELECT id::text AS id, code, summary
         FROM bookings
         WHERE coalesce((itinerary->>'sale_known')::boolean, true) = false
         ORDER BY booked_on DESC NULLS LAST
         LIMIT 50`,
      )
    ).rows;
    for (const b of missingSale) {
      items.push({
        kind: 'Missing sale price',
        title: `${b.code} · Missing sale price`,
        detail: String(b.summary || 'Customer sale remains Unknown'),
        booking_id: String(b.id),
        urgency: 'missing_info',
      });
    }
  } catch {
    /* fixture variance */
  }

  try {
    const missingTraveler = (
      await db.query(
        `SELECT b.id::text AS id, b.code, b.summary
         FROM bookings b
         WHERE coalesce(cardinality(b.traveler_ids), 0) = 0
         ORDER BY b.booked_on DESC NULLS LAST
         LIMIT 40`,
      )
    ).rows;
    for (const b of missingTraveler) {
      items.push({
        kind: 'Traveler missing',
        title: `${b.code} · Traveler missing`,
        detail: 'Select the actual traveler; billed customer is not a traveler by default.',
        booking_id: String(b.id),
        urgency: 'missing_info',
      });
    }
  } catch {
    /* traveler_ids column shape may differ */
  }

  try {
    const unpaid = (
      await db.query(
        `SELECT b.id::text AS id, b.code, b.summary,
                greatest(coalesce(b.sale,0) - coalesce(b.paid,0), 0) AS balance
         FROM bookings b
         WHERE coalesce((b.itinerary->>'sale_known')::boolean, true) = true
           AND coalesce(b.sale,0) > coalesce(b.paid,0)
         ORDER BY (coalesce(b.sale,0) - coalesce(b.paid,0)) DESC
         LIMIT 50`,
      )
    ).rows;
    for (const b of unpaid) {
      items.push({
        kind: 'Customer unpaid',
        title: `${b.code} · Unpaid balance`,
        detail: String(b.summary || 'Customer still owes'),
        booking_id: String(b.id),
        urgency: 'open',
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const dues = (
      await db.query(
        `SELECT id::text AS id, code, due_on::text AS due_on
         FROM commissions
         WHERE due_on IS NOT NULL
           AND due_on::date <= $1::date
           AND coalesce(status,'') NOT IN ('Received','Cancelled','Waived')
         ORDER BY due_on ASC
         LIMIT 50`,
        [tomorrow],
      )
    ).rows;
    for (const row of dues) {
      const due_on = String(row.due_on || '');
      items.push({
        kind: 'Commission due',
        title: `${row.code || row.id} · commission due ${due_on}`,
        due_on,
        urgency: due_on < as_of ? 'overdue' : due_on === tomorrow ? 'due_tomorrow' : 'open',
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const drafts = (
      await db.query(
        `SELECT d.id::text AS id, d.title, d.entry
         FROM booking_drafts d
         WHERE NOT EXISTS (
           SELECT 1 FROM commands c
           WHERE c.kind='booking'
             AND c.result IS NOT NULL
             AND c.payload->'operational'->>'draft_id' = d.id::text
         )
         ORDER BY d.created_at DESC
         LIMIT 40`,
      )
    ).rows;
    for (const d of drafts) {
      const entry =
        d.entry && typeof d.entry === 'object' ? (d.entry as Record<string, unknown>) : {};
      const capture =
        entry.intake_capture && typeof entry.intake_capture === 'object'
          ? (entry.intake_capture as { needs_owner_alert?: boolean; missing?: string[] })
          : null;
      const missing = Array.isArray(capture?.missing) ? capture!.missing!.join(', ') : '';
      items.push({
        kind: capture?.needs_owner_alert ? 'Intake needs review' : 'Open draft',
        title: String(d.title || d.id),
        detail: capture?.needs_owner_alert
          ? `Missing: ${missing || 'review fields'} — human check before trusting AI`
          : 'Intake draft not yet saved as a live booking',
        urgency: capture?.needs_owner_alert ? 'missing_info' : 'open',
      });
    }
  } catch {
    /* ignore */
  }

  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
    counts[`urgency:${item.urgency}`] = (counts[`urgency:${item.urgency}`] || 0) + 1;
  }

  const top = items.slice(0, 25);
  const plain_summary = [
    `Padova reminders as of ${as_of} (${items.length} open):`,
    ...top.map(
      (i) =>
        `- [${i.urgency}] ${i.title}${i.due_on ? ` (due ${i.due_on})` : ''}${
          i.detail ? ` — ${i.detail}` : ''
        }`,
    ),
    items.length > top.length ? `…and ${items.length - top.length} more.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { as_of, counts, items, plain_summary };
}

function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
