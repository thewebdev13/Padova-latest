/**
 * Plan v1 — voucher / travel-asset expiry reminders (dashboard to-do / attention).
 * Bands match Held PNR: overdue / due today / due within 3 days. No invented money.
 */

import { heldDeadlineUrgency } from './held-pnr';

export type VoucherExpiryReminder = {
  key: string;
  fingerprint: string;
  title: string;
  detail: string;
  kind: 'Asset expiration';
  due_on: string;
  urgency: 'due_soon' | 'due_today' | 'overdue';
  record_type: 'asset';
  record_id: string;
};

export function buildVoucherExpiryReminders(
  assets: Array<{
    id: string;
    name?: string;
    kind?: string | null;
    balance?: unknown;
    expires_on?: string | null;
  }>,
  today: string,
): VoucherExpiryReminder[] {
  const out: VoucherExpiryReminder[] = [];
  for (const a of assets) {
    if (!(Number(a.balance) > 0)) continue;
    const expires = a.expires_on ? String(a.expires_on).slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) continue;
    const urgency = heldDeadlineUrgency(expires, today);
    if (urgency === 'ok' || urgency === 'none') continue;
    const label =
      urgency === 'overdue'
        ? 'expired — still has remaining value'
        : urgency === 'due_today'
          ? 'expires today'
          : 'expires within 3 days';
    const kindLabel = String(a.kind || 'Travel asset');
    out.push({
      key: `expiry:${a.id}`,
      fingerprint: `${expires}:${a.balance}:${urgency}`,
      title: `${a.name || kindLabel} · ${label}`,
      detail: `Expires ${expires}. Use, sell, or record expiration.`,
      kind: 'Asset expiration',
      due_on: expires,
      urgency,
      record_type: 'asset',
      record_id: a.id,
    });
  }
  return out;
}
