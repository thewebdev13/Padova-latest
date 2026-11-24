/**
 * Confidence gate for intake → live vs draft + Owner notify.
 * Never invents money; Unknown stays Unknown.
 */

export type IntakeConfidence = 'high' | 'low';

export type IntakeCaptureMeta = {
  confidence: IntakeConfidence;
  extract: 'ai' | 'rules' | 'pattern' | 'none';
  tags: string[];
  missing: string[];
  needs_owner_alert: boolean;
  ai_generated: boolean;
};

function isBlankOrUnknown(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).normalize('NFKC').trim();
  return !s || /^(unknown|n\/a|not applicable)$/i.test(s);
}

/** Required ops facts for high-confidence live promote (money may stay Unknown). */
export function assessIntakeCapture(input: {
  entry: Record<string, unknown>;
  issues?: string[];
  recognized_fields?: string[];
}): IntakeCaptureMeta {
  const entry = input.entry || {};
  const provenance = (entry.intake_provenance || {}) as Record<string, unknown>;
  const ai = (provenance.ai || {}) as Record<string, unknown>;
  const pattern = (provenance.pattern || {}) as Record<string, unknown>;
  const patternUsed = Boolean(entry.pattern_created) || pattern.used === true;
  const aiUsed = Boolean(entry.ai_created) || ai.used === true;
  const extract: IntakeCaptureMeta['extract'] = patternUsed
    ? 'pattern'
    : aiUsed
      ? 'ai'
      : (input.recognized_fields?.length ?? 0) >= 3
        ? 'rules'
        : 'none';

  const missing: string[] = [];
  const product = String(entry.product || '').trim();
  if (!['Flight', 'Hotel', 'Car', 'Other'].includes(product)) missing.push('product');

  const travel_start = String(entry.travel_start || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(travel_start)) missing.push('travel_start');

  const traveler =
    entry.intake_traveler_label ||
    entry.pending_traveler ||
    (entry.intake_party_hints as Record<string, unknown> | undefined)?.traveler;
  if (isBlankOrUnknown(traveler)) missing.push('traveler');

  const customer =
    entry.intake_customer_label ||
    (entry.intake_party_hints as Record<string, unknown> | undefined)?.customer;
  // Customer may be Unknown person for live (promote creates Unknown) — only flag if totally absent and no traveler.
  if (isBlankOrUnknown(customer) && isBlankOrUnknown(traveler)) missing.push('customer_or_traveler');

  if (product === 'Flight' && isBlankOrUnknown(entry.route)) missing.push('route');
  if (product === 'Hotel' && isBlankOrUnknown(entry.location) && isBlankOrUnknown(entry.route))
    missing.push('location');

  const criticalMissing = missing.filter((m) =>
    ['product', 'travel_start', 'traveler', 'customer_or_traveler'].includes(m),
  );
  const confidence: IntakeConfidence = criticalMissing.length === 0 ? 'high' : 'low';

  const tags = [
    `confidence:${confidence}`,
    `extract:${extract}`,
    aiUsed ? 'ai_generated' : 'rules_or_raw',
    ...missing.map((m) => `missing:${m}`),
  ];
  if (input.issues?.some((i) => /AI|Claude|OpenAI|timeout|extract/i.test(i)))
    tags.push('extract_issue');

  const needs_owner_alert =
    confidence === 'low' ||
    Boolean(ai.error) ||
    (input.issues?.length ?? 0) > 0 && criticalMissing.length > 0;

  return {
    confidence,
    extract,
    tags,
    missing,
    needs_owner_alert,
    ai_generated: aiUsed,
  };
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  product: 'Product',
  travel_start: 'Travel date',
  travel_end: 'Return date',
  traveler: 'Traveler',
  customer: 'Customer',
  customer_or_traveler: 'Customer or traveler',
  route: 'Route',
  location: 'Location / hotel',
  confirmation: 'Confirmation #',
  pnr: 'PNR',
  sale: 'Sale amount',
};

/** Staff-facing labels for intake missing keys (never show snake_case in UI). */
export function formatIntakeMissingLabel(key: string): string {
  const raw = String(key || '').trim();
  if (!raw) return '';
  if (MISSING_FIELD_LABELS[raw]) return MISSING_FIELD_LABELS[raw];
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatIntakeMissingSummary(missing: unknown): string {
  if (!Array.isArray(missing) || !missing.length) return '';
  const labels = missing
    .map((m) => formatIntakeMissingLabel(String(m)))
    .filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return `Still need: ${labels[0]}`;
  if (labels.length === 2) return `Still need: ${labels[0]} and ${labels[1]}`;
  return `Still need: ${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

/** Short Owner WhatsApp text — never invents amounts. */
export function formatIntakeOwnerAlert(input: {
  channel: string;
  title: string;
  draft_id?: string;
  booking_id?: string;
  booking_code?: string;
  live: boolean;
  capture: IntakeCaptureMeta;
  chat_or_mailbox?: string;
  reason?: string;
}): string {
  const lines = [
    'Padova intake alert (Owner only, not a customer reply)',
    `Channel: ${input.channel}`,
    input.chat_or_mailbox ? `From: ${input.chat_or_mailbox}` : '',
    `Title: ${input.title}`,
    input.live
      ? `Live booking: ${input.booking_code || input.booking_id || 'created'} (verify money/parties)`
      : `Draft only: ${input.draft_id || '(saving)'}`,
    input.capture.missing.length
      ? `Missing: ${input.capture.missing.join(', ')}`
      : 'Required ops fields present (money may still be Unknown)',
    `Tags: ${input.capture.tags.slice(0, 8).join(' · ')}`,
    input.reason ? `Note: ${input.reason}` : '',
    'Open QA → Bookings / drafts to review. Do not invent amounts.',
  ].filter(Boolean);
  return lines.join('\n');
}

/** Attach capture meta onto draft entry (mutable). */
export function applyIntakeCaptureToEntry(
  entry: Record<string, unknown>,
  capture: IntakeCaptureMeta,
): Record<string, unknown> {
  entry.intake_capture = capture;
  entry.intake_tags = capture.tags;
  if (capture.ai_generated) entry.ai_generated = true;
  return entry;
}

/**
 * Short WhatsApp intake acknowledgment for the sender chat.
 * Status only — never invents money amounts or booking economics.
 */
export function formatWhatsAppIntakeStatusReply(input: {
  live: boolean;
  draft_id?: string;
  booking_code?: string;
  ai_generated?: boolean;
  error?: string;
  skipped_chatter?: boolean;
}): string | null {
  if (input.skipped_chatter) return null;
  if (input.error) {
    const sizeIssue = /too large|payload/i.test(input.error);
    return [
      sizeIssue
        ? 'Padova received your file but it was too large to process in one message. Please resend a smaller PDF/photo, or paste the confirmation text.'
        : 'Padova received your message but could not file it automatically.',
      'Staff will review. Please do not invent or resend money figures, Unknown stays Unknown until verified.',
    ].join('\n');
  }
  if (input.live && input.booking_code) {
    return [
      `Padova filed this in the system as booking ${input.booking_code}.`,
      input.ai_generated
        ? 'Recorded as AI-assisted intake, staff will verify money and parties before treating amounts as final.'
        : 'Staff will verify money and parties before treating amounts as final.',
    ].join('\n');
  }
  if (input.live) {
    return [
      'Padova filed this in the system as a live booking.',
      input.ai_generated
        ? 'Recorded as AI-assisted intake, staff will verify money and parties.'
        : 'Staff will verify money and parties.',
    ].join('\n');
  }
  return [
    'Padova saved this as a draft for staff review (not final books yet).',
    input.ai_generated ? 'AI assisted the extract, amounts stay Unknown until verified.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}
