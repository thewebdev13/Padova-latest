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

/**
 * Schedule / itinerary *change* notices — not a new booking confirmation.
 * Capital One / airline “Your flight details have changed” must not become drafts.
 */
const SCHEDULE_CHANGE_NOISE =
  /\b((your\s+)?flight\s+details\s+have\s+changed|(your\s+)?itinerary\s+has\s+changed|(your\s+)?trip\s+details\s+have\s+changed|schedule\s+change|flight\s+(has\s+been\s+)?(changed|rescheduled|rebooked|delayed)|change(?:s)?\s+to\s+your\s+(flight|trip|itinerary|reservation|booking)|we(?:'ve| have)\s+(updated|changed)\s+your\s+(flight|itinerary|trip|reservation)|important\s+change\s+to\s+your\s+(flight|trip|itinerary)|updated\s+flight\s+times?|departure\s+time\s+(has\s+)?changed|gate\s+change\s+notification)\b/i;

/** Info / status links without a new purchase confirmation. */
const INFORMATIONAL_TRIP_NOISE =
  /\b(track\s+your\s+flight|flight\s+status\s+alert|view\s+your\s+(trip|itinerary)\s+online|manage\s+your\s+trip|trip\s+alert|travel\s+advisory|weather\s+advisory)\b/i;

/** Strong proof this is a *new* purchase / ticket — overrides weak “confirmation” wording. */
const STRONG_NEW_BOOKING =
  /\b(thanks for your purchase|thank you for (your )?purchase|booking confirmation|reservation confirmed|e-?ticket\b|ticket issued|you(?:'ve| have) booked|purchase complete|new\s+booking\s+confirmation|itinerary confirmation)\b/i;

/** Hebrew “check-in opened / preparations for your flight” style subjects. */
const OPERATIONAL_NOISE_HE = /צ['׳']?ק[- ]?אין|טיסתך\s+נפתחה|הכנות\s+לקראת\s+טיסת/;

/**
 * Padova's own desk digests / intake alerts — must NEVER become bookings.
 * These mention Flight/Hotel/confirmation while listing open DB items.
 */
const PADOVA_INTERNAL_NOISE =
  /\b(padova\s+reminders?|padova\s+intake\s+alert|owner\s+only\s*[ - \-–]\s*not\s+a\s+customer\s+reply|open\s+items\s*\(\s*db\s+facts\s+only\s*\)|db\s+facts\s+only)\b/i;

export function isPadovaInternalNoise(text: string): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (PADOVA_INTERNAL_NOISE.test(t)) return true;
  // Digest body: many "[MISSING INFO]" lines without a real reservation paste.
  const missingHits = t.match(/\[MISSING INFO\]/gi) || [];
  if (missingHits.length >= 2) return true;
  if (
    missingHits.length >= 1 &&
    /\b(open\s+items|padova\s+reminders?|needs\s+review)\b/i.test(t) &&
    !/\b(dear|passenger|guest name|e-?ticket|itinerary confirmation)\b/i.test(t)
  )
    return true;
  return false;
}

/** Flight/itinerary change notice — never treat as a new booking confirmation. */
export function isScheduleChangeNotice(text: string): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (!SCHEDULE_CHANGE_NOISE.test(t)) return false;
  // Extremely rare: change notice glued to a brand-new purchase confirmation.
  if (STRONG_NEW_BOOKING.test(t) && /\b(thanks for your purchase|ticket issued|e-?ticket)\b/i.test(t))
    return false;
  return true;
}

export function isInformationalTripNoise(text: string): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (!INFORMATIONAL_TRIP_NOISE.test(t)) return false;
  // Do not call looksLikePurchaseOrEnquiry here (it uses operational noise → cycle).
  if (STRONG_NEW_BOOKING.test(t) || PURCHASE_OR_ENQUIRY.test(t)) return false;
  if (CONFIRM_SIGNAL.test(t) && /\b(e-?ticket|reservation confirmed|booking confirmation)\b/i.test(t))
    return false;
  return true;
}

export function isOperationalTravelNoise(text: string): boolean {
  const t = String(text || '');
  return (
    isPadovaInternalNoise(t) ||
    isScheduleChangeNotice(t) ||
    isInformationalTripNoise(t) ||
    OPERATIONAL_NOISE.test(t) ||
    OPERATIONAL_NOISE_HE.test(t)
  );
}

/**
 * Staff-facing gate before draft / AI fill / Save Booking.
 * Returns why the text is not a new booking confirmation (or null when OK).
 */
export function intakeReservationBlockReason(text: string): string | null {
  const t = String(text || '').trim();
  if (!t) return null;
  if (isPadovaInternalNoise(t))
    return 'This looks like a Padova desk reminder/alert, not a customer reservation.';
  if (isScheduleChangeNotice(t))
    return 'This looks like a flight/itinerary change notice, not a new booking confirmation. Do not Save Booking until you verify — or Discard.';
  if (isInformationalTripNoise(t))
    return 'This looks like trip info / status mail, not a new booking confirmation.';
  if (OPERATIONAL_NOISE.test(t) || OPERATIONAL_NOISE_HE.test(t))
    return 'This looks like a check-in / boarding reminder, not a new booking confirmation.';
  if (!looksLikeBookingReservationText(t) && t.length >= 40)
    return 'Could not verify a booking confirmation in this text. Paste a real reservation (or Field: Value lines) before Save Booking.';
  return null;
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
  // Desk digests / intake alerts first — before Flight/Hotel/confirmation signals.
  if (isPadovaInternalNoise(t)) return false;
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
