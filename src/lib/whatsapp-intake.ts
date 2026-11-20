import { buildIntakeDraft, type BuiltIntakeDraft } from './booking-intake';
export { looksLikeBookingRelatedWhatsApp } from './booking-message-detect';
import { looksLikeBookingRelatedWhatsApp } from './booking-message-detect';
import { applyIntakeCaptureToEntry, assessIntakeCapture } from './intake-confidence';

export type InboundWhatsAppMessage = {
  /** Linked PC session label — never a Meta Business API send path. */
  session_label?: string;
  chat_name?: string;
  from_number?: string;
  text: string;
  received_at?: string;
  message_id?: string;
  /** Optional PDF / screenshot / voice-note bytes — server extracts (PDF, OCR, Whisper). */
  bytes?: Buffer;
  filename?: string;
  mimeType?: string;
};

/** PC bridge posts here; Meta Cloud API send is out of scope. */
export function whatsappIntakeStatus() {
  const bridgeToken = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
  const ownerAlerts = /^(1|true|yes)$/i.test(
    String(process.env.PADOVA_WHATSAPP_ALLOW_OWNER_ALERTS || '').trim(),
  );
  return {
    mode: bridgeToken ? 'pc_bridge_token_present' : 'awaiting_owner_pc_bridge',
    /** Customer chats: never auto-reply. */
    read_only: true,
    auto_send: false,
    auto_reply_customers: false,
    /** Optional Baileys send to allowlisted Owner phones only (PC helper). */
    owner_alerts_configured: ownerAlerts,
    meta_cloud_api: false,
    twilio: false,
    posts_money: false,
    note: bridgeToken
      ? ownerAlerts
        ? 'PC Baileys helper: inbound → drafts/live; Owner-only alerts if owner_phones set. Never customer auto-reply.'
        : 'Bridge token is set. Run npm run intake:whatsapp-helper on the PC. Inbound drafts only until allow_owner_alerts + owner_phones.'
      : 'Waiting on Owner PC linked WhatsApp session. Staff can still paste chat text via the shared booking-intake API with source=whatsapp.',
  };
}

export function assertWhatsAppBridgeAuth(headerToken: string | null | undefined) {
  const expected = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
  if (!expected) throw new Error('WhatsApp PC bridge is not configured (missing bridge token)');
  if (!headerToken || headerToken !== expected)
    throw new Error('WhatsApp bridge authorization rejected');
}

function minimalCaptureDraft(
  message: InboundWhatsAppMessage,
  reason: string,
): BuiltIntakeDraft {
  const title = [
    message.chat_name || 'WhatsApp',
    'intake needs review',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 180);
  const entry: Record<string, unknown> = {
    product: '',
    traveler_ids: [],
    new_travelers: [],
    components: [],
    customer_id: '',
    route: '',
    location: '',
    travel_start: '',
    travel_end: '',
    reservation_summary: reason,
    summary_override: true,
    notes: `WhatsApp capture fallback:\n- ${reason}\n\nRaw text kept for human review. Do not invent money.`,
    intake_raw_text: String(message.text || '').slice(0, 20000),
    recovery_paste: String(message.text || '').slice(0, 20000),
    intake_provenance: {
      source: 'whatsapp',
      received_at: message.received_at,
      filename: message.filename,
      from_address: message.from_number,
      subject: message.chat_name,
      text_extractable: Boolean(message.text?.trim()),
      extract_note: reason,
    },
    intake_apply_on_open: true,
  };
  const issues = [reason, 'Draft forced so reservation-class WhatsApp is never silently dropped'];
  const capture = assessIntakeCapture({ entry, issues, recognized_fields: [] });
  applyIntakeCaptureToEntry(entry, capture);
  return { title, entry, issues, recognized_fields: [] };
}

/**
 * Build draft from inbound WhatsApp text and/or PDF bytes.
 * Reservation-class messages always produce a draft (Phase 1 — no silent drop).
 * Chatter-only text still throws so the PC helper can skip.
 */
export async function prepareWhatsAppIntakeDraft(message: InboundWhatsAppMessage) {
  const hasText = Boolean(message.text?.trim());
  const hasBytes = Boolean(message.bytes?.length);
  if (!hasText && !hasBytes)
    throw new Error(
      'WhatsApp intake requires message text, PDF, screenshot, or voice note',
    );

  // Pre-check on caption/text only; PDF/image extract is checked after build via recognized content.
  if (hasText && !hasBytes && !looksLikeBookingRelatedWhatsApp(message.text)) {
    throw new Error(
      'WhatsApp text does not look like a booking/reservation; draft not created (chatter skipped)',
    );
  }

  const filename =
    message.filename ||
    (message.message_id
      ? `whatsapp:${message.message_id}`
      : message.session_label
        ? `whatsapp-session:${message.session_label}`
        : undefined);

  try {
    const built = await buildIntakeDraft({
      source: 'whatsapp',
      text: message.text || '',
      bytes: message.bytes,
      subject: message.chat_name,
      fromAddress: message.from_number,
      receivedAt: message.received_at,
      filename,
      mimeType: message.mimeType || (hasBytes ? 'application/pdf' : 'text/plain'),
    });

    const probe = [
      message.text || '',
      typeof (built.entry as { intake_raw_text?: string }).intake_raw_text === 'string'
        ? (built.entry as { intake_raw_text: string }).intake_raw_text
        : '',
      built.title || '',
    ].join('\n');

    // PDF / weak extract: still keep draft when inbound looked booking-related or PDF present.
    if (
      !looksLikeBookingRelatedWhatsApp(probe) &&
      (built.recognized_fields?.length ?? 0) < 2 &&
      !hasBytes &&
      !looksLikeBookingRelatedWhatsApp(message.text || '')
    ) {
      throw new Error(
        'WhatsApp content does not look like a booking/reservation; draft not created (unrelated skipped)',
      );
    }

    if (
      !looksLikeBookingRelatedWhatsApp(probe) &&
      (built.recognized_fields?.length ?? 0) < 2 &&
      (hasBytes || looksLikeBookingRelatedWhatsApp(message.text || ''))
    ) {
      built.issues = [
        ...(built.issues || []),
        'Low field recognition — draft kept for human review (no silent drop)',
      ];
      const capture = assessIntakeCapture({
        entry: built.entry,
        issues: built.issues,
        recognized_fields: built.recognized_fields,
      });
      applyIntakeCaptureToEntry(built.entry, capture);
    }

    return built;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'WhatsApp intake failed';
    const bookingClass =
      hasBytes || looksLikeBookingRelatedWhatsApp(message.text || '');
    // Pure chatter: keep skip. Reservation-class / PDF: always capture a draft.
    if (!bookingClass) throw e;
    return minimalCaptureDraft(message, msg);
  }
}
