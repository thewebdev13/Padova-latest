/**
 * Shared gate: email / WhatsApp → booking_draft only for real reservation content.
 * Tuned to Padova intake PDFs printed from mail (Amex, United, Marriott, Chase TRC,
 * Expedia TAAP, Capital One, GDS, etc.) — not newsletters, check-in reminders, or chat.
 */

const FIELD_LABEL =
  /^(product|customer|traveler|guest|property|airline|seller|pnr|confirmation(?:\s*(?:#|no\.?|number))?|record\s*locator|check[- ]?in|check[- ]?out|pickup|drop[- ]?off|route|sale|total(?:\s*cost)?|booked\s*through|purchased\s*from|departure|arrival|trip\s*id|hotel\s*confirmation)\s*:/gim;

const CONFIRM_SIGNAL =
  /\b(confirmation|confirmed:\s*your\s+trip|reservation confirmed|booking confirmation|itinerary|e-?ticket|travel reservation|trip confirmation|hotel confirmation|flight confirmation)\b/i;

/** Travel product signals — avoid bare “check-in” (matches airline reminder spam). */
const TRAVEL_SIGNAL =
  /\b(hotel|flight|airline|record locator|\bpnr\b|marriott|hilton|hyatt|st\.?\s*regis|united|delta|el al|amex travel|american express travel|expedia|taap|capital one travel|chase travel|travel reservation center|trip id|guest name|prepared for|check[- ]?out|resort|rosewood|aspen|nell)\b/i;

const BOOKING_SENDER =
  /\b(americanexpress|aexp\.com|united\.com|ual\.com|marriott|hilton|hyatt|expedia|travelocity|capitalone|chase\.com|delta\.com|elal|etihad|booking\.com|hotels\.com|amadeus|sabre|taap|rosewood|whotels|thelittlenell|stjulien|qatar|emirates|britishairways|lufthansa)\b/i;

/**
 * Purchase confirmations + hotel direct-booking enquiries (often forwarded to bookings@).
 * These should become drafts even when Field:Value lines are missing.
 */
const PURCHASE_OR_ENQUIRY =
  /\b(thanks for your purchase|thank you for your purchase|purchase[, ]+reference|order\s+reference|booking\s+reference|reservation\s+reference|direct\s+booking\s+(enquir|inquir)y|booking\s+(enquir|inquir)y|new\s+(booking\s+)?(enquir|inquir)y|reservation\s+request|booking\s+request)\b/i;

const REFERENCE_CODE = /\b(?:reference|ref(?:erence)?\.?|conf(?:irmation)?\.?)\s*[#:.]?\s*[A-Z0-9-]{4,}\b/i;

/**
 * Operational mail that is travel-related but not a new/changed reservation
 * (Delta “It's Time To Check In…”, boarding pass nudges, Hebrew check-in open, etc.).
 */
const OPERATIONAL_NOISE =
  /\b(it'?s\s+time\s+to\s+check[- ]?in|time\s+to\s+check[- ]?in|ready\s+to\s+check[- ]?in|check[- ]?in\s+is\s+(now\s+)?open|online\s+check[- ]?in|web\s+check[- ]?in|mobile\s+check[- ]?in|check[- ]?in\s+for\s+your\s+flight|boarding\s+pass\s+(is\s+)?ready|download\s+your\s+boarding\s+pass|select\s+your\s+seats?|seat\s+selection\s+(is\s+)?open|flight\s+reminder|day\s+of\s+(your\s+)?travel|upcoming\s+trip\s+reminder)\b/i;

/** Hebrew “check-in opened / preparations for your flight” style subjects. */
const OPERATIONAL_NOISE_HE = /צ['׳']?ק[- ]?אין|טיסתך\s+נפתחה|הכנות\s+לקראת\s+טיסת/;

export function isOperationalTravelNoise(text: string): boolean {
  const t = String(text || '');
  return OPERATIONAL_NOISE.test(t) || OPERATIONAL_NOISE_HE.test(t);
}

export function looksLikePurchaseOrEnquiry(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 16) return false;
  if (isOperationalTravelNoise(t)) return false;
  if (PURCHASE_OR_ENQUIRY.test(t)) return true;
  if (/\bthanks for your purchase\b/i.test(t) && REFERENCE_CODE.test(t)) return true;
  if (/\bpurchase\b/i.test(t) && REFERENCE_CODE.test(t) && t.length >= 24) return true;
  return false;
}

/** Core text detector (WhatsApp captions, email bodies, PDF extract). */
export function looksLikeBookingReservationText(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 20) return false;
  if (isOperationalTravelNoise(t)) return false;
  if (looksLikePurchaseOrEnquiry(t)) return true;

  const fieldHits = [...t.matchAll(FIELD_LABEL)];
  const uniqueLabels = new Set(fieldHits.map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')));

  if (uniqueLabels.size >= 2) return true;

  if (uniqueLabels.size === 1) {
    const label = [...uniqueLabels][0];
    const strong =
      /^(product|customer|traveler|property|pnr|confirmation|record locator)$/i.test(label);
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (
      strong &&
      lines.length >= 2 &&
      /\b(hotel|flight|car|pnr|check[- ]?out|confirmation|customer|traveler|property|airline|reservation)\b/i.test(
        t,
      )
    )
      return true;
  }

  if (CONFIRM_SIGNAL.test(t) && TRAVEL_SIGNAL.test(t) && t.length >= 60) return true;
  return false;
}

/** WhatsApp alias — same strict bar. */
export function looksLikeBookingRelatedWhatsApp(text: string): boolean {
  return looksLikeBookingReservationText(text);
}

/** Email: body/PDF text + subject + known travel senders (Amex/United/etc.). */
export function looksLikeBookingRelatedEmail(input: {
  subject?: string;
  text?: string;
  from_address?: string;
}): boolean {
  const subject = String(input.subject || '').trim();
  const text = String(input.text || '').trim();
  const from = String(input.from_address || '').trim();
  const combined = `${subject}\n${text}`.trim();

  if (isOperationalTravelNoise(combined) || isOperationalTravelNoise(subject)) return false;

  if (looksLikePurchaseOrEnquiry(combined) || looksLikePurchaseOrEnquiry(subject)) return true;
  if (looksLikeBookingReservationText(combined)) return true;
  if (looksLikeBookingReservationText(text)) return true;

  // Known booking senders + real confirmation language (not check-in nudges).
  if (BOOKING_SENDER.test(from) && CONFIRM_SIGNAL.test(`${subject} ${text}`) && combined.length >= 40)
    return true;
  if (
    BOOKING_SENDER.test(from) &&
    TRAVEL_SIGNAL.test(`${subject} ${text}`) &&
    /\b(confirm(?:ation)?|itinerary|reservation|e-?ticket|\bpnr\b|record\s*locator)\b/i.test(
      subject,
    ) &&
    combined.length >= 40
  )
    return true;

  return false;
}
