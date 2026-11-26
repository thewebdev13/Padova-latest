/**
 * Plan audit log source: screen · WhatsApp · email · import.
 * Never invents WhatsApp/email — default is Screen when staff acted in the UI.
 */

export const AUDIT_CHANNELS = ['screen', 'whatsapp', 'email', 'import'] as const;
export type AuditChannel = (typeof AUDIT_CHANNELS)[number];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function matchChannel(raw: string): AuditChannel | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('whatsapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s.includes('gmail') || s.includes('mail')) return 'email';
  if (s.includes('import') || s.includes('histor') || s.includes('sheet')) return 'import';
  if (s.includes('screen') || s.includes('ui') || s.includes('workspace')) return 'screen';
  return null;
}

/**
 * Infer Plan source channel from audit payload.
 * Blank / unrecognized → screen (staff UI) — never invent WhatsApp or email.
 */
export function auditEventChannel(event: {
  after_value?: unknown;
  before_value?: unknown;
  reason?: string | null;
  kind?: string | null;
}): AuditChannel {
  const after = asRecord(event.after_value);
  const input = asRecord(after.input);
  const provenance = asRecord(input.intake_provenance);
  const result = asRecord(after.result);
  const candidates = [
    provenance.source,
    input.intake_source,
    input.source,
    result.intake_source,
    event.reason,
  ];
  for (const c of candidates) {
    const hit = matchChannel(String(c ?? ''));
    if (hit) return hit;
  }
  return 'screen';
}

export function auditEventChannelLabel(channel: AuditChannel | string | null | undefined): string {
  switch (String(channel || '').toLowerCase()) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'email':
      return 'Email';
    case 'import':
      return 'Import';
    default:
      return 'Screen';
  }
}

/**
 * Plan Activity history search: summary · kind · actor · source · record id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function auditMatchesSearch(
  event: {
    id?: string | null;
    summary?: string | null;
    kind?: string | null;
    actor_name?: string | null;
    actor?: string | null;
    source_label?: string | null;
    source_channel?: string | null;
    record_id?: string | null;
  },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    event.summary,
    event.kind,
    event.actor_name,
    event.actor,
    event.source_label,
    event.source_channel,
    event.record_id,
    event.id,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}
