import { buildIntakeDraft } from './booking-intake';

export type InboundWhatsAppMessage = {
  /** Linked PC session label — never a Meta Business API send path. */
  session_label?: string;
  chat_name?: string;
  from_number?: string;
  text: string;
  received_at?: string;
  message_id?: string;
};

/** PC bridge posts here; Meta Cloud API send is out of scope. */
export function whatsappIntakeStatus() {
  const bridgeToken = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
  return {
    mode: bridgeToken ? 'pc_bridge_token_present' : 'awaiting_owner_pc_bridge',
    read_only: true,
    auto_send: false,
    meta_cloud_api: false,
    posts_money: false,
    note: bridgeToken
      ? 'Bridge token is set. On the PC run npm run intake:whatsapp-web (QR link) or intake:whatsapp-bridge (folder). Never auto-send.'
      : 'Waiting on Owner PC linked WhatsApp session. Staff can still paste chat text via the shared booking-intake API with source=whatsapp.',
  };
}

export function assertWhatsAppBridgeAuth(headerToken: string | null | undefined) {
  const expected = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
  if (!expected) throw new Error('WhatsApp PC bridge is not configured (missing bridge token)');
  if (!headerToken || headerToken !== expected)
    throw new Error('WhatsApp bridge authorization rejected');
}

/** Skip short chatter so bridge does not create blank wa:… drafts. */
export function looksLikeBookingRelatedWhatsApp(text: string) {
  const t = String(text || '').trim();
  if (t.length < 12) return false;
  if (/^(product|customer|traveler|property|sale|total|hotel|flight|pnr|confirmation)\s*:/im.test(t))
    return true;
  return /\b(confirm(ation|ed)?|reservation|itinerary|booking|e-?ticket|record locator|pnr|check[- ]?in|check[- ]?out|flight|hotel|airline|marriott|hilton|hyatt|amex travel|expedia|guest|traveler|depart|arrival|product\s*:)/i.test(
    t,
  );
}

/** Build draft from inbound WhatsApp text. Does not write to the database. */
export async function prepareWhatsAppIntakeDraft(message: InboundWhatsAppMessage) {
  if (!message.text?.trim()) throw new Error('WhatsApp intake requires message text');
  if (!looksLikeBookingRelatedWhatsApp(message.text)) {
    throw new Error(
      'WhatsApp text does not look like a booking/reservation; draft not created (chatter skipped)',
    );
  }
  return buildIntakeDraft({
    source: 'whatsapp',
    text: message.text,
    subject: message.chat_name,
    fromAddress: message.from_number,
    receivedAt: message.received_at,
    filename: message.message_id
      ? `whatsapp:${message.message_id}`
      : message.session_label
        ? `whatsapp-session:${message.session_label}`
        : undefined,
    mimeType: 'text/plain',
  });
}
