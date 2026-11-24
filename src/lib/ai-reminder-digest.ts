import { createHash } from 'node:crypto';
import type { ReminderItem } from './ai-ops-reminders';

/** E.164-ish digits only (no +). Empty if unusable. */
export function normalizeOwnerPhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return digits;
}

export function ownerPhonesFromEnvOrList(list: unknown): string[] {
  const fromEnv = String(process.env.PADOVA_WHATSAPP_OWNER_PHONES || '')
    .split(/[,;\s]+/)
    .map(normalizeOwnerPhone)
    .filter(Boolean);
  const fromList = Array.isArray(list)
    ? list.map((v) => normalizeOwnerPhone(String(v))).filter(Boolean)
    : [];
  return [...new Set([...fromEnv, ...fromList])];
}

export function reminderDigestFingerprint(items: ReminderItem[], asOf: string): string {
  const body = items
    .map((i) => `${i.urgency}|${i.kind}|${i.title}|${i.due_on || ''}|${i.booking_id || ''}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(`${asOf}\n${body}`).digest('hex').slice(0, 24);
}

/**
 * Short Owner WhatsApp digest — DB facts only, no invented money.
 * Keep under typical WA comfort length.
 */
export function formatOwnerReminderDigest(input: {
  as_of: string;
  items: ReminderItem[];
  plain_summary?: string;
  max_lines?: number;
}): { text: string; fingerprint: string; count: number } {
  const maxLines = input.max_lines ?? 18;
  const items = input.items || [];
  const fingerprint = reminderDigestFingerprint(items, input.as_of);
  if (!items.length) {
    return {
      text: `Padova, ${input.as_of}\nNo open reminders right now.`,
      fingerprint,
      count: 0,
    };
  }

  const priority = (u: ReminderItem['urgency']) =>
    u === 'overdue' ? 0 : u === 'due_tomorrow' ? 1 : u === 'missing_info' ? 2 : 3;
  const sorted = [...items].sort(
    (a, b) => priority(a.urgency) - priority(b.urgency) || a.title.localeCompare(b.title),
  );
  const top = sorted.slice(0, maxLines);
  const lines = [
    `Padova reminders, ${input.as_of}`,
    `${items.length} open item${items.length === 1 ? '' : 's'} (DB facts only):`,
    ...top.map((i) => {
      const tag =
        i.urgency === 'overdue'
          ? 'OVERDUE'
          : i.urgency === 'due_tomorrow'
            ? 'DUE TOMORROW'
            : i.urgency === 'missing_info'
              ? 'MISSING INFO'
              : 'OPEN';
      return `• [${tag}] ${i.title}${i.due_on ? ` (${i.due_on})` : ''}`;
    }),
    items.length > top.length ? `…+${items.length - top.length} more in Padova Attention.` : '',
    'Open Padova to fix. This alert is automated from your PC helper.',
  ].filter(Boolean);

  return { text: lines.join('\n').slice(0, 3500), fingerprint, count: items.length };
}
