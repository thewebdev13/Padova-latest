import { buildIntakeDraft } from './booking-intake';
export { looksLikeBookingRelatedWhatsApp } from './booking-message-detect';
import { looksLikeBookingRelatedWhatsApp } from './booking-message-detect';

export type InboundWhatsAppMessage = {
  /** Linked PC session label — never a Meta Business API send path. */
  session_label?: string;
  chat_name?: string;
  from_number?: string;
  text: string;
  received_at?: string;
  message_id?: string;
  /** Optional PDF/bytes — server extracts text (same as file intake). */
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
        ? 'PC Baileys helper: inbound → drafts; Owner-only reminder digests if owner_phones set. Never customer auto-reply.'
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

/** Build draft from inbound WhatsApp text and/or PDF bytes. Does not write to the database. */
export async function prepareWhatsAppIntakeDraft(message: InboundWhatsAppMessage) {
  const hasText = Boolean(message.text?.trim());
  const hasBytes = Boolean(message.bytes?.length);
  if (!hasText && !hasBytes) throw new Error('WhatsApp intake requires message text or a PDF file');

  // Pre-check on caption/text only; PDF extract is checked after build via recognized content.
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
  if (!looksLikeBookingRelatedWhatsApp(probe) && (built.recognized_fields?.length ?? 0) < 2) {
    throw new Error(
      'WhatsApp content does not look like a booking/reservation; draft not created (unrelated skipped)',
    );
  }
  return built;
}
