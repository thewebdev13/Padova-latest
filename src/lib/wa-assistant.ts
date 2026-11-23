/**
 * Staff-only WhatsApp assistant: AI propose → ask missing → confirm SAVE → live.
 * Never invents money. Learns via intake-patterns on confirmed saves.
 * booking_drafts are immutable — field patches live in the promote payload / helper session.
 */

import type { Database, SQL } from './db';
import { maybePromoteIntakeToLiveBooking } from './ai-intake-promote';
import { learnIntakePatternFireAndForget } from './intake-patterns';
import type { Actor } from './permissions';
import {
  classifyStaffChatIntent,
  formatStaffGreeting,
  formatStaffOpeningReply,
  formatStaffOpsBriefing,
  isStaffGreetingText,
  isStaffMenuRequest,
  isStaffSmalltalkText,
  polishHumanChat,
  type StaffChatMemory,
} from './wa-staff-chat';

type R = Record<string, unknown>;

function digits(value: string | undefined | null): string {
  return String(value || '').replace(/\D/g, '');
}

/** Staff/Owner phones that may receive assistant Q&A (not customers). */
export function waAssistantPhones(): string[] {
  const raw =
    process.env.PADOVA_WA_ASSISTANT_PHONES ||
    process.env.PADOVA_WHATSAPP_OWNER_PHONES ||
    '';
  return String(raw)
    .split(/[,;\s]+/)
    .map((p) => digits(p))
    .filter((p) => p.length >= 8);
}

export function isWaAssistantPhone(fromNumber: string | undefined | null): boolean {
  const n = digits(fromNumber);
  if (!n) return false;
  return waAssistantPhones().some((p) => n === p || n.endsWith(p) || p.endsWith(n));
}

/**
 * Bridge helper may claim assistant mode (token-auth). Phone allowlist optional.
 * body.assistant=true → staff SAVE-gate path; customers still never get chat text
 * (helper routes replies to staff phones only).
 */
export function isWaAssistantRequest(
  fromNumber: string | undefined | null,
  body?: { assistant?: unknown },
): boolean {
  if (body?.assistant === true || body?.assistant === 'true' || body?.assistant === 1) return true;
  return isWaAssistantPhone(fromNumber);
}

function blank(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).normalize('NFKC').trim();
  return !s || /^(unknown|n\/a|not applicable)$/i.test(s);
}

export function assistantAskQuestions(entry: R): string[] {
  const q: string[] = [];
  const customer =
    entry.intake_customer_label ||
    (entry.intake_party_hints as R | undefined)?.customer;
  if (blank(customer)) q.push('Customer name? (reply: Customer: …)');
  const product = String(entry.product || '').trim();
  if (!['Flight', 'Hotel', 'Car', 'Other'].includes(product))
    q.push('Booking type? (reply: Product: Flight|Hotel|Car|Other)');
  if (blank(entry.travel_start) || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.travel_start || '')))
    q.push('Travel / check-in date? (reply: Travel start: YYYY-MM-DD)');
  if (blank(entry.sale)) q.push('Customer price / sale? (reply: Sale: 123.45 or Sale: Unknown)');
  if (blank(entry.notes) && blank(entry.reservation_summary))
    q.push('Cost breakdown if known? (reply: Cost notes: …)');
  if (blank(entry.booking_source_confirmation) && blank(entry.primary_reference))
    q.push('Where booked / Booked Through? (reply: Booked Through: …)');
  return q;
}

function humanField(label: string, value: unknown): string {
  const v = blank(value) ? 'still blank' : String(value).trim();
  return `${label}: ${v}`;
}

export function formatAssistantProposal(input: {
  draft_id: string;
  title: string;
  entry: R;
  recognized_fields?: string[];
  extract?: string;
}): string {
  const e = input.entry || {};
  const customer =
    e.intake_customer_label ||
    (e.intake_party_hints as R | undefined)?.customer ||
    '';
  const lines = [
    `Got it. Drafted from that${input.title ? ` (${input.title})` : ''}.`,
    '',
    'What I could fill (blank where unclear):',
    humanField('Customer', customer),
    humanField('Type', e.product),
    humanField('Travel start', e.travel_start),
    humanField('Travel end', e.travel_end),
    humanField('Sale', e.sale),
    humanField('Route / place', e.route || e.location),
    humanField(
      'Booked through',
      e.booking_source_confirmation || e.primary_reference,
    ),
  ];
  if (input.extract) lines.push(`From the file: ${String(input.extract).slice(0, 240)}`);

  const questions = assistantAskQuestions(e);
  lines.push('');
  if (questions.length) {
    lines.push('Still need:');
    for (const q of questions) lines.push(`- ${q.replace(/\s*\(reply:.*?\)\s*$/i, '')}`);
    lines.push('');
    lines.push('Reply in plain words, e.g. Customer Miriam / Sale 410 / Travel start 2027-03-01');
  } else {
    lines.push('Looks ready on my side.');
  }
  lines.push('');
  lines.push('Say SAVE to go live, or CANCEL to keep the draft.');
  return polishHumanChat(lines.join('\n'));
}

export type AssistantReplyKind = 'save' | 'cancel' | 'fields' | 'unknown';

export function parseAssistantStaffReply(text: string): {
  kind: AssistantReplyKind;
  fields: R;
} {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (/^(save|yes|confirm|post|write live)\b/i.test(lower) || lower === 'save')
    return { kind: 'save', fields: {} };
  if (/^(cancel|stop|no)\b/i.test(lower) && lower.length < 20)
    return { kind: 'cancel', fields: {} };

  const fields: R = {};
  // Colon or plain "Customer Miriam" / "Sale 410" style.
  const patterns: [RegExp, string][] = [
    [/^customer\s*[:\-]?\s*(.+)$/im, 'intake_customer_label'],
    [/^traveler\s*[:\-]?\s*(.+)$/im, 'intake_traveler_label'],
    [/^product\s*[:\-]?\s*(.+)$/im, 'product'],
    [/^travel\s*start\s*[:\-]?\s*(.+)$/im, 'travel_start'],
    [/^travel\s*end\s*[:\-]?\s*(.+)$/im, 'travel_end'],
    [/^sale\s*[:\-]?\s*(.+)$/im, 'sale'],
    [/^price\s*[:\-]?\s*(.+)$/im, 'sale'],
    [/^booked\s*through\s*[:\-]?\s*(.+)$/im, 'booking_source_confirmation'],
    [/^where\s*booked\s*[:\-]?\s*(.+)$/im, 'booking_source_confirmation'],
    [/^cost\s*notes?\s*[:\-]?\s*(.+)$/ims, 'notes'],
    [/^route\s*[:\-]?\s*(.+)$/im, 'route'],
    [/^location\s*[:\-]?\s*(.+)$/im, 'location'],
  ];
  for (const [re, key] of patterns) {
    const m = raw.match(re);
    if (m?.[1]) fields[key] = m[1].trim();
  }
  if (fields.product) {
    const p = String(fields.product);
    const hit = ['Flight', 'Hotel', 'Car', 'Other'].find(
      (x) => x.toLowerCase() === p.toLowerCase(),
    );
    if (hit) fields.product = hit;
  }
  if (Object.keys(fields).length) return { kind: 'fields', fields };
  return { kind: 'unknown', fields: {} };
}

export function mergeAssistantFields(entry: R, fields: R, staffLine?: string): R {
  const next = { ...entry };
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || String(v).trim() === '') continue;
    if (k === 'notes') {
      next.notes = [String(next.notes || ''), String(v)].filter(Boolean).join('\n').slice(0, 8000);
    } else next[k] = v;
  }
  const transcript = Array.isArray((next.itinerary as R | undefined)?.wa_assistant_transcript)
    ? [...((next.itinerary as R).wa_assistant_transcript as string[])]
    : [];
  if (staffLine) transcript.push(`${new Date().toISOString()} staff→ ${staffLine.slice(0, 500)}`);
  next.itinerary = {
    ...((next.itinerary as R) || {}),
    wa_assistant: true,
    wa_assistant_status: 'awaiting_confirm',
    wa_assistant_transcript: transcript.slice(-40),
    ai_created: true,
    created_by: 'ai',
  };
  next.ai_created = true;
  return next;
}

export function stampAssistantDraftEntry(
  entry: R,
  opts: { from_number?: string; raw_text?: string; message_id?: string },
): R {
  const transcript = [
    `${new Date().toISOString()} inbound ${opts.message_id || ''}`.trim(),
    String(opts.raw_text || '').slice(0, 4000),
  ].filter(Boolean);
  const prior = (entry.itinerary as R | undefined) || {};
  return {
    ...entry,
    ai_created: true,
    itinerary: {
      ...prior,
      ai_created: true,
      created_by: 'ai',
      wa_assistant: true,
      wa_assistant_status: 'awaiting_confirm',
      wa_assistant_from: digits(opts.from_number),
      wa_assistant_started:
        typeof prior.wa_assistant_started === 'string'
          ? prior.wa_assistant_started
          : new Date().toISOString(),
      wa_assistant_transcript: transcript,
    },
    notes: [
      String(entry.notes || ''),
      'WhatsApp assistant session. Say SAVE when ready, or CANCEL to keep draft only.',
      opts.raw_text ? `Inbound:\n${String(opts.raw_text).slice(0, 3000)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 8000),
  };
}

export async function findOpenAssistantDraft(
  db: SQL,
  fromNumber: string,
): Promise<{ id: string; title: string; entry: R; created_at?: string } | null> {
  const n = digits(fromNumber);
  // Prefer draft tied to this staff phone; else latest open assistant draft (multi-PC staff).
  const rows = (
    await db.query(
      `SELECT id, title, entry, created_at::text AS created_at FROM booking_drafts
       WHERE entry->'itinerary'->>'wa_assistant' = 'true'
         AND COALESCE(entry->'itinerary'->>'wa_assistant_status','') IN ('awaiting_confirm','awaiting_answers')
         AND (
           $1 = ''
           OR entry->'itinerary'->>'wa_assistant_from' = $1
           OR right(regexp_replace(COALESCE(entry->'itinerary'->>'wa_assistant_from',''), '\\D', '', 'g'), 10)
              = right($1, 10)
           OR COALESCE(entry->'itinerary'->>'wa_assistant_from','') = ''
         )
       ORDER BY
         CASE
           WHEN $1 <> '' AND (
             entry->'itinerary'->>'wa_assistant_from' = $1
             OR right(regexp_replace(COALESCE(entry->'itinerary'->>'wa_assistant_from',''), '\\D', '', 'g'), 10)
                = right($1, 10)
           ) THEN 0
           ELSE 1
         END,
         created_at DESC
       LIMIT 1`,
      [n],
    )
  ).rows;
  if (!rows[0]) return null;
  return {
    id: String(rows[0].id),
    title: String(rows[0].title || ''),
    entry: (rows[0].entry || {}) as R,
    created_at: rows[0].created_at ? String(rows[0].created_at) : undefined,
  };
}

export async function confirmAssistantSave(
  db: Database,
  actor: Actor,
  draft: { id: string; title: string; entry: R },
  rawInstruction: string,
): Promise<{
  live: boolean;
  booking_code?: string;
  booking_id?: string;
  reason?: string;
  entry: R;
  reply: string;
}> {
  let entry = { ...draft.entry };
  const itinerary = { ...((entry.itinerary as R) || {}) };
  const transcript = Array.isArray(itinerary.wa_assistant_transcript)
    ? [...(itinerary.wa_assistant_transcript as string[])]
    : [];
  transcript.push(`${new Date().toISOString()} staff→ SAVE`);
  if (rawInstruction) transcript.push(rawInstruction.slice(0, 2000));
  itinerary.wa_assistant_transcript = transcript.slice(-50);
  itinerary.wa_assistant_status = 'confirmed';
  itinerary.ai_created = true;
  itinerary.created_by = 'ai';
  entry.itinerary = itinerary;
  entry.ai_created = true;
  entry.notes = [
    String(entry.notes || ''),
    'Confirmed via WhatsApp assistant SAVE.',
    `Transcript:\n${transcript.join('\n---\n')}`.slice(0, 6000),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000);

  const promote = await maybePromoteIntakeToLiveBooking(db, actor, {
    draft_id: draft.id,
    title: draft.title,
    entry,
    force: true,
  });

  try {
    const raw = String(entry.intake_raw_text || entry.recovery_paste || '');
    const paste = String(entry.recovery_paste || entry.intake_raw_text || '');
    if (raw && paste) {
      learnIntakePatternFireAndForget(db, {
        raw,
        aiPaste: paste,
        subject: String((entry.intake_provenance as R | undefined)?.subject || ''),
        source_hint: 'wa-assistant',
      });
    }
  } catch {
    /* learn best-effort */
  }

  if (promote.live) {
    return {
      live: true,
      booking_id: promote.booking_id,
      booking_code: promote.booking_code,
      entry,
      reply: polishHumanChat(
        [
          `Done. ${promote.booking_code || 'Booking'} is live.`,
          promote.sale_known
            ? 'Tagged AI-assisted so it stays distinct from hand-entered books.'
            : 'Sale is still blank. Fill it in Padova when you know. I left it empty on purpose.',
          'Quick check on money and parties before you treat it as final.',
        ].join('\n'),
      ),
    };
  }

  const ask = assistantAskQuestions(entry);
  return {
    live: false,
    reason: promote.reason,
    entry,
    reply: polishHumanChat(
      [
        `Could not go live yet${promote.reason ? ` (${promote.reason})` : ''}. Draft is still here.`,
        ask.length
          ? `Still need:\n${ask.map((q) => `- ${q.replace(/\s*\(reply:.*?\)\s*$/i, '')}`).join('\n')}`
          : '',
        'Send those and say SAVE again when ready.',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  };
}

export function isAssistantFollowUpText(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return parseAssistantStaffReply(t).kind !== 'unknown';
}

/** Short hello / help / how are you — conversational openers (never invents money). */
export function isAssistantGreetingText(text: string): boolean {
  return (
    isStaffGreetingText(text) ||
    isStaffSmalltalkText(text) ||
    isStaffMenuRequest(text)
  );
}

export function formatAssistantOpeningReply(
  text: string,
  memory?: StaffChatMemory,
): { text: string; showedMenu: boolean; kind: string } {
  return formatStaffOpeningReply(text, memory);
}

/**
 * Desk / platform / report questions — DB facts only (no invented money).
 */
export function isAssistantOpsQuestion(text: string): boolean {
  if (!String(text || '').trim()) return false;
  if (isAssistantGreetingText(text)) return false;
  if (isAssistantFollowUpText(text)) return false;
  const intent = classifyStaffChatIntent(text);
  return intent === 'ops' || intent === 'report';
}

export function isAssistantGuideQuestion(text: string): boolean {
  if (!String(text || '').trim()) return false;
  if (isAssistantGreetingText(text)) return false;
  if (isAssistantFollowUpText(text)) return false;
  return classifyStaffChatIntent(text) === 'guide';
}

/** Freeform staff chat (beyond SAVE / fields / ops / guide). */
export function isAssistantFreeChat(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 280) return false;
  if (isAssistantGreetingText(t)) return false;
  if (isAssistantFollowUpText(t)) return false;
  if (isAssistantOpsQuestion(t)) return false;
  if (isAssistantGuideQuestion(t)) return false;
  if (classifyStaffChatIntent(t) !== 'chat') return false;
  const words = t.split(/\s+/).length;
  if (/[?]/.test(t)) return true;
  if (
    /^(can you|could you|please|what|where|how|why|when|who|show|tell|help|explain|find|open|list|give|make|create|need)\b/i.test(
      t,
    )
  )
    return true;
  return words <= 12;
}

export function formatAssistantHelpMenu(memory?: StaffChatMemory): string {
  return formatStaffGreeting(memory);
}

/** Desk briefing from collectOpsReminders (DB facts only). */
export function formatAssistantOpsBriefing(input: {
  as_of: string;
  counts: Record<string, number>;
  items: { kind: string; title: string; detail?: string; urgency: string }[];
  full?: boolean;
}): string {
  return formatStaffOpsBriefing(input);
}
