import { createHash } from 'node:crypto';
import {
  csvToIntakeBlocks,
  extractTextFromEml,
  looksLikeEml,
  parseEmlEnvelope,
  splitIntakeEntries,
  INTAKE_EMAIL_MAILBOXES,
} from './booking-intake-split';
import { extractBinaryIntakeText } from './intake-file-text';
import { inferLooseIntakeHints, mergeLooseIntakeHints } from './intake-email-hints';
import { UNREAD_FILE_MESSAGE } from './intake-preview';
import { redactOperationalText } from './operational-redaction';
import { normalizePasteValue, parseQuickPaste } from './quick-paste';
import {
  aiDisclaimerLine,
  aiIntakeEnabled,
  extractBookingPasteWithClaude,
} from './claude-intake';
import { applyIntakeCaptureToEntry, assessIntakeCapture } from './intake-confidence';
import {
  intakeReservationBlockReason,
  isOperationalTravelNoise,
} from './booking-message-detect';

export {
  csvToIntakeBlocks,
  extractTextFromEml,
  looksLikeEml,
  parseEmlEnvelope,
  splitIntakeEntries,
  INTAKE_BATCH_SIZE,
  INTAKE_MAX_ENTRIES,
  INTAKE_EMAIL_MAILBOXES,
} from './booking-intake-split';

/** Channels that feed the same booking_draft → staff approve path. */
export type IntakeSource =
  | 'staff_upload'
  | 'staff_paste'
  | 'email'
  | 'whatsapp'
  | 'instinct';

export type IntakeProvenance = {
  source: IntakeSource;
  received_at: string;
  filename?: string;
  mime_type?: string;
  sha256?: string;
  byte_length?: number;
  text_extractable: boolean;
  extract_note?: string;
  from_address?: string;
  subject?: string;
  mailbox?: string;
  entry_index?: number;
  entry_count?: number;
  ai?: {
    provider: 'openai' | 'anthropic' | 'claude';
    used: boolean;
    model: string | null;
    skipped_reason: string | null;
    error: string | null;
    disclaimer: string | null;
  };
};

const TEXT_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'message/rfc822',
  'application/json',
]);
const BINARY_HINT =
  "We couldn't read this file – paste the text instead. Nothing posts money from intake.";

const PRODUCTS = ['Flight', 'Hotel', 'Car', 'Other'] as const;

function looksLikePlainIntakeText(mimeType: string, filename: string) {
  const mime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const lower = filename.toLowerCase();
  return (
    TEXT_TYPES.has(mime) ||
    /\.(txt|csv|md|eml|json)$/i.test(lower) ||
    (mime === 'application/octet-stream' && /\.(txt|csv|md|eml)$/i.test(lower))
  );
}

/**
 * Extract text for intake. Plain text/EML sync path; PDF text-layer + local image OCR async.
 * Never invents booking facts — raw text only for Field:Value parse.
 */
export async function extractIntakeText(
  mimeType: string,
  bytes: Buffer,
  filename = 'upload',
  opts?: { fast?: boolean },
): Promise<{ text: string; extractable: boolean; note?: string; method?: string }> {
  const mime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const lower = filename.toLowerCase();
  if (!looksLikePlainIntakeText(mime, filename)) {
    return extractBinaryIntakeText(mime, bytes, filename, opts);
  }
  const text = bytes.toString('utf8');
  if (text.includes('\u0000'))
    return {
      text: '',
      extractable: false,
      note: `File “${filename}” looks binary despite text mime; ${BINARY_HINT}`,
    };
  if (mime === 'message/rfc822' || /\.eml$/i.test(lower)) {
    const body = extractTextFromEml(text);
    return {
      text: body,
      extractable: Boolean(body.trim()),
      note: body.trim()
        ? undefined
        : `Email “${filename}” had no extractable plain text; paste Field: Value lines or use staff email forward.`,
    };
  }
  return { text, extractable: true };
}

export function intakeSha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function productFromPaste(raw: string | undefined): (typeof PRODUCTS)[number] | '' {
  if (!raw) return '';
  const hit = PRODUCTS.find((p) => normalizePasteValue(p) === normalizePasteValue(raw));
  return hit ?? '';
}

export type BuiltIntakeDraft = {
  title: string;
  entry: Record<string, unknown>;
  issues: string[];
  recognized_fields: string[];
};

/** Form-shaped draft entry. Never creates payments, charges, or journal rows. */
export async function buildIntakeDraft(input: {
  text?: string;
  source: IntakeSource;
  filename?: string;
  mimeType?: string;
  bytes?: Buffer;
  fromAddress?: string;
  subject?: string;
  mailbox?: string;
  receivedAt?: string;
  entryIndex?: number;
  entryCount?: number;
  /** Cron time budget: skip LLM, keep pattern/rules only. */
  skipAi?: boolean;
}): Promise<BuiltIntakeDraft> {
  const received_at = input.receivedAt ?? new Date().toISOString();
  const bytes = input.bytes;
  let text = input.text ?? '';
  let text_extractable = Boolean(text.trim());
  let extract_note: string | undefined;
  let sha256: string | undefined;
  let byte_length: number | undefined;
  let mime_type = input.mimeType;
  let filename = input.filename;

  if (bytes?.length) {
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Intake file must be 10 MB or smaller');
    sha256 = intakeSha256(bytes);
    byte_length = bytes.length;
    const extracted = await extractIntakeText(
      mime_type || 'application/octet-stream',
      bytes,
      filename,
    );
    if (extracted.extractable)
      text = text.trim() ? `${text.trim()}\n\n${extracted.text}` : extracted.text;
    else extract_note = extracted.note;
    text_extractable = text_extractable || extracted.extractable;
    // Site Feedback 3: do not create a silent empty draft from unread PDF/image.
    if (!text_extractable && !text.trim()) throw new Error(UNREAD_FILE_MESSAGE);
  } else if (text.trim() && looksLikeEml(text, filename)) {
    // Client batch uploads send .eml as text entries — strip to plain body first.
    const body = extractTextFromEml(text);
    if (body.trim()) {
      text = body;
      text_extractable = true;
      mime_type = mime_type || 'message/rfc822';
    } else {
      extract_note = `Email “${filename || 'message'}” had no extractable plain text; paste Field: Value lines or use staff email forward.`;
      text_extractable = false;
    }
  }

  const redacted = redactOperationalText(text).slice(0, 20000);
  let workingText = redacted;
  let aiUsed = false;
  let patternUsed = false;
  let patternId: string | undefined;
  let aiModelName: string | undefined;
  let aiProviderName: 'openai' | 'anthropic' | undefined;
  let aiError: string | undefined;
  let aiSkipped: string | undefined;
  const reservationBlock = intakeReservationBlockReason(
    `${input.subject || ''}\n${redacted}`.trim(),
  );
  const notBookingConfirmation =
    Boolean(reservationBlock) || isOperationalTravelNoise(`${input.subject || ''}\n${redacted}`);
  // Never let AI invent Product/Route/PNR from change notices or reminders.
  if (notBookingConfirmation && redacted.trim()) aiSkipped = 'not_booking_confirmation';
  // AI enrich for email/WA/instinct free-form (OpenAI or Claude from server key).
  const tryAi =
    !notBookingConfirmation &&
    !input.skipAi &&
    aiIntakeEnabled() &&
    Boolean(redacted.trim()) &&
    (input.source === 'email' ||
      input.source === 'whatsapp' ||
      input.source === 'instinct' ||
      String(process.env.PADOVA_AI_INTAKE_ALL_SOURCES || '').trim() === '1');
  if (input.skipAi && redacted.trim() && !aiSkipped) aiSkipped = 'cron_time_budget';
  if ((tryAi || (input.skipAi && redacted.trim())) && !notBookingConfirmation) {
    let db: Awaited<ReturnType<typeof import('./db').database>> | null = null;
    try {
      const { database } = await import('./db');
      db = await database();
    } catch {
      db = null;
    }
    const { tryLearnedIntakePaste, learnIntakePatternFireAndForget } = await import(
      './intake-patterns'
    );
    // Pattern learn first (cheap). LLM only when tryAi and no pattern hit.
    const learned = await tryLearnedIntakePaste(db, redacted, input.subject);
    if (learned?.paste?.trim()) {
      workingText = learned.paste;
      patternUsed = true;
      patternId = learned.pattern_id;
      aiSkipped = 'learned_pattern';
    } else if (tryAi) {
      const extracted = await extractBookingPasteWithClaude(redacted, {
        subject: input.subject,
      });
      aiSkipped = extracted.skipped_reason;
      aiError = extracted.error;
      aiModelName = extracted.model;
      aiProviderName = extracted.provider;
      if (extracted.used && extracted.paste.trim()) {
        workingText = extracted.paste;
        aiUsed = true;
        learnIntakePatternFireAndForget(db, {
          raw: redacted,
          subject: input.subject,
          aiPaste: extracted.paste,
          source_hint: input.source,
        });
      }
    }
  }
  const preview = parseQuickPaste(
    notBookingConfirmation
      ? redacted || 'Notes: Not a new booking confirmation'
      : workingText || 'Notes: Intake with no extractable Field: Value lines',
  );
  // Free-form hotel enquiry / purchase mail rarely has Field: Value — fill empty slots only.
  // Skip loose invent for change notices / reminders (prevents fake Product/Route/PNR).
  const looseHints = notBookingConfirmation
    ? {}
    : inferLooseIntakeHints({
        subject: input.subject,
        text: redacted,
        from_address: input.fromAddress,
      });
  const fields = notBookingConfirmation
    ? (preview.fields as Record<string, unknown>)
    : mergeLooseIntakeHints(preview.fields as Record<string, unknown>, looseHints);
  const issues = [
    ...preview.issues,
    ...preview.unknown.map((u) => `${u.label}: ${u.value}`),
    ...(extract_note ? [extract_note] : []),
    ...(aiError ? [`Claude extract note: ${aiError}`] : []),
    ...(reservationBlock ? [reservationBlock] : []),
  ];
  if (!redacted.trim() && !filename)
    issues.push('Provide plain text or a text file; intake creates a draft only');

  const product = productFromPaste(fields.product as string | undefined);
  const route = typeof fields.route === 'string' ? fields.route : '';
  const customerLabel = typeof fields.customer === 'string' ? fields.customer.trim() : '';
  const travelerLabel = typeof fields.traveler === 'string' ? fields.traveler.trim() : '';
  const propertyLabel = typeof fields.property === 'string' ? fields.property.trim() : '';
  const airlineLabel = typeof fields.airline === 'string' ? fields.airline.trim() : '';
  // Never invent route/PNR from the file name (Site Feedback 3).
  const summary =
    typeof fields.reservation_summary === 'string'
      ? fields.reservation_summary
      : input.subject?.trim() ||
        (text_extractable
          ? product
            ? `${product} intake`
            : 'Booking intake draft'
          : filename
            ? `Unread file, paste text instead`
            : 'Booking intake draft');

  const provenance: IntakeProvenance = {
    source: input.source,
    received_at,
    filename,
    mime_type,
    sha256,
    byte_length,
    text_extractable,
    extract_note,
    from_address: input.fromAddress,
    subject: input.subject,
    mailbox: input.mailbox,
    entry_index: input.entryIndex,
    entry_count: input.entryCount,
  };

  const primaryReference =
    typeof fields.primary_reference === 'string' ? fields.primary_reference : '';

  const entry: Record<string, unknown> = {
    product,
    traveler_ids: [],
    new_travelers: [],
    components: [],
    customer_id: '',
    route,
    // Hotel form uses City / Location — map Route into it so the field is not blank.
    location: product === 'Hotel' ? route : '',
    travel_start: typeof fields.travel_start === 'string' ? fields.travel_start : '',
    travel_end: typeof fields.travel_end === 'string' ? fields.travel_end : '',
    primary_reference: primaryReference,
    flight_numbers: fields.flight_numbers ?? '',
    ticket_numbers: fields.ticket_numbers ?? '',
    cabin: fields.cabin ?? '',
    room_type: fields.room_type ?? '',
    pickup_location: fields.pickup_location ?? '',
    dropoff_location: fields.dropoff_location ?? '',
    description: fields.description ?? '',
    reservation_summary: summary,
    summary_override: Boolean(summary),
    // Prefill traveler search box when Continue Draft opens.
    pending_traveler:
      travelerLabel && !/^(unknown|n\/a|not applicable)$/i.test(travelerLabel)
        ? travelerLabel
        : '',
    intake_customer_label:
      customerLabel && !/^(unknown|n\/a|not applicable)$/i.test(customerLabel)
        ? customerLabel
        : '',
    intake_traveler_label:
      travelerLabel && !/^(unknown|n\/a|not applicable)$/i.test(travelerLabel)
        ? travelerLabel
        : '',
    intake_provider_label: propertyLabel || airlineLabel || '',
    notes: [
      typeof fields.notes === 'string' ? fields.notes : '',
      aiUsed ? aiDisclaimerLine(aiProviderName) : '',
      patternUsed
        ? 'Filled from a saved intake pattern (no new AI call). Verify money and parties.'
        : '',
      issues.length ? `Intake review notes:\n- ${issues.slice(0, 20).join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    intake_provenance: {
      ...provenance,
      ...(aiUsed || aiSkipped || aiError || patternUsed
        ? {
            ai: {
              provider: aiProviderName ?? 'openai',
              used: aiUsed,
              model: aiModelName ?? null,
              skipped_reason: aiSkipped ?? null,
              error: aiError ?? null,
              disclaimer: aiUsed ? aiDisclaimerLine(aiProviderName) : null,
            },
            ...(patternUsed
              ? {
                  pattern: {
                    used: true,
                    pattern_id: patternId ?? null,
                    skipped_ai: true,
                  },
                }
              : {}),
          }
        : {}),
    },
    intake_raw_text: redacted,
    recovery_paste: aiUsed || patternUsed ? workingText : redacted,
    intake_field_hints: fields,
    intake_unresolved: preview.unknown,
    ...(aiUsed
      ? {
          ai_created: true,
          ai_disclaimer: aiDisclaimerLine(aiProviderName),
        }
      : {}),
    ...(patternUsed ? { pattern_created: true } : {}),
    intake_party_hints: {
      customer: fields.customer ?? null,
      traveler: fields.traveler ?? null,
      airline: fields.airline ?? null,
      property: fields.property ?? null,
      seller: fields.seller ?? null,
      method: fields.method ?? null,
      referring_organization: fields.referring_organization ?? null,
    },
    intake_apply_on_open: true,
  };

  if (fields.sale !== undefined) entry.sale = fields.sale;
  if (fields.customer_paid !== undefined) entry.intake_customer_paid = fields.customer_paid;
  if (fields.trip_type) {
    const trip = normalizePasteValue(String(fields.trip_type));
    entry.trip_type =
      trip === 'round trip'
        ? 'Round Trip'
        : trip === 'one way'
          ? 'One Way'
          : ['multi-city', 'multi city'].includes(trip)
            ? 'Multi-City'
            : '';
  }

  const titleParts = [
    customerLabel && !/^(unknown|n\/a)$/i.test(customerLabel) ? customerLabel : '',
    product || '',
    route || summary || '',
    primaryReference || '',
    input.entryCount && input.entryCount > 1
      ? `(${(input.entryIndex ?? 0) + 1}/${input.entryCount})`
      : '',
  ].filter(Boolean);

  const recognized = new Set([
    ...Object.keys(preview.fields),
    ...Object.entries(looseHints)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k),
  ]);

  const recognized_fields = [...recognized];
  const capture = assessIntakeCapture({ entry, issues, recognized_fields });
  applyIntakeCaptureToEntry(entry, capture);

  return {
    title: titleParts.join(' · ').slice(0, 180) || 'Booking intake draft',
    entry,
    issues,
    recognized_fields,
  };
}

/** Build one draft per detected entry in paste/upload text. */
export async function buildIntakeDrafts(input: {
  text?: string;
  source: IntakeSource;
  filename?: string;
  mimeType?: string;
  bytes?: Buffer;
  fromAddress?: string;
  subject?: string;
  mailbox?: string;
  receivedAt?: string;
}): Promise<BuiltIntakeDraft[]> {
  let combined = input.text ?? '';
  let extract_note: string | undefined;
  let bytes = input.bytes;
  let fromAddress = input.fromAddress;
  let subject = input.subject;
  let mailbox = input.mailbox;
  let source = input.source;
  if (bytes?.length) {
    const rawUtf8 = bytes.toString('utf8');
    // Parse .eml envelope from original bytes before body-only extract clears headers.
    if (
      looksLikeEml(rawUtf8, input.filename) ||
      /\.eml$/i.test(input.filename || '') ||
      input.mimeType === 'message/rfc822'
    ) {
      const envelope = parseEmlEnvelope(rawUtf8);
      fromAddress = fromAddress || envelope.from_address;
      subject = subject || envelope.subject;
      mailbox = mailbox || envelope.mailbox;
      if (source === 'staff_upload' && mailbox) source = 'email';
    }
    const extracted = await extractIntakeText(
      input.mimeType || 'application/octet-stream',
      bytes,
      input.filename,
    );
    if (extracted.extractable)
      combined = combined.trim() ? `${combined.trim()}\n\n${extracted.text}` : extracted.text;
    else {
      extract_note = extracted.note;
      if (!combined.trim()) throw new Error(UNREAD_FILE_MESSAGE);
    }
    // Bytes already consumed for text/OCR — drafts use text parts only.
    bytes = undefined;
  }
  // Text-only .eml uploads (no bytes) still need From/To/Subject from the raw paste.
  if (!fromAddress && !subject && !mailbox && looksLikeEml(combined, input.filename)) {
    const envelope = parseEmlEnvelope(combined);
    fromAddress = fromAddress || envelope.from_address;
    subject = subject || envelope.subject;
    mailbox = mailbox || envelope.mailbox;
    if (source === 'staff_upload' && mailbox) source = 'email';
  }
  const parts = splitIntakeEntries(combined, input.filename);
  const base = { ...input, source, fromAddress, subject, mailbox };
  if (!parts.length) {
    return [
      await buildIntakeDraft({
        ...base,
        text: extract_note ? `${combined}\n\nNotes: ${extract_note}`.trim() : combined,
        bytes: undefined,
        entryIndex: 0,
        entryCount: 1,
      }),
    ];
  }
  return Promise.all(
    parts.map((part, index) =>
      buildIntakeDraft({
        ...base,
        bytes: undefined,
        text: part,
        entryIndex: index,
        entryCount: parts.length,
      }),
    ),
  );
}

/** Build drafts for an explicit list of entry texts (batched client uploads). */
export async function buildIntakeDraftsFromEntries(
  entries: string[],
  input: {
    source: IntakeSource;
    filename?: string;
    fromAddress?: string;
    subject?: string;
    mailbox?: string;
    receivedAt?: string;
    entryOffset?: number;
    entryTotal?: number;
  },
): Promise<BuiltIntakeDraft[]> {
  const total = input.entryTotal ?? entries.length;
  const offset = input.entryOffset ?? 0;
  return Promise.all(
    entries.map((part, i) =>
      buildIntakeDraft({
        text: part,
        source: input.source,
        filename: input.filename,
        fromAddress: input.fromAddress,
        subject: input.subject,
        mailbox: input.mailbox,
        receivedAt: input.receivedAt,
        entryIndex: offset + i,
        entryCount: total,
      }),
    ),
  );
}

/** Owner mailboxes + optional `PADOVA_EMAIL_INTAKE_TEST_MAILBOX` (local QA only). */
export function intakeEmailMailboxes(): string[] {
  const boxes: string[] = [...INTAKE_EMAIL_MAILBOXES];
  const test = process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX?.trim().toLowerCase();
  if (test && !boxes.includes(test)) boxes.push(test);
  return boxes;
}

export function assertAllowedIntakeMailbox(mailbox: string | undefined) {
  if (!mailbox) throw new Error('Email intake requires the mailbox address');
  let normalized = mailbox.trim().toLowerCase();
  // Live Workspace still uses bookings@padovatravels.com — treat as bookings@padovatravel.com.
  if (normalized === 'bookings@padovatravels.com') normalized = 'bookings@padovatravel.com';
  if (!intakeEmailMailboxes().includes(normalized))
    throw new Error(
      'Email intake is limited to Shmuel@padovatravel.com, mindy@padovatravel.com, bookings@padovatravel.com' +
        (process.env.PADOVA_EMAIL_INTAKE_TEST_MAILBOX?.trim()
          ? `, or the configured test mailbox`
          : ''),
    );
  return normalized;
}
