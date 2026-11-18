/**
 * Shared gate: email / WhatsApp → booking_draft only for real reservation content.
 * Tuned to Padova intake PDFs printed from mail (Amex, United, Marriott, Chase TRC,
 * Expedia TAAP, Capital One, GDS, etc.) — not newsletters or casual chat.
 */

const FIELD_LABEL =
  /^(product|customer|traveler|guest|property|airline|seller|pnr|confirmation(?:\s*(?:#|no\.?|number))?|record\s*locator|check[- ]?in|check[- ]?out|pickup|drop[- ]?off|route|sale|total(?:\s*cost)?|booked\s*through|purchased\s*from|departure|arrival|trip\s*id|hotel\s*confirmation)\s*:/gim;

const CONFIRM_SIGNAL =
  /\b(confirmation|confirmed:\s*your\s+trip|reservation confirmed|booking confirmation|itinerary|e-?ticket|travel reservation|trip confirmation|hotel confirmation|flight confirmation)\b/i;

const TRAVEL_SIGNAL =
  /\b(hotel|flight|airline|check[- ]?in|check[- ]?out|record locator|\bpnr\b|marriott|hilton|hyatt|st\.?\s*regis|united|delta|el al|amex travel|american express travel|expedia|taap|capital one travel|chase travel|travel reservation center|trip id|guest name|prepared for)\b/i;

const BOOKING_SENDER =
  /\b(americanexpress|aexp\.com|united\.com|ual\.com|marriott|hilton|hyatt|expedia|travelocity|capitalone|chase\.com|delta\.com|elal|booking\.com|hotels\.com|amadeus|sabre|taap)\b/i;

/** Core text detector (WhatsApp captions, email bodies, PDF extract). */
export function looksLikeBookingReservationText(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 20) return false;

  const fieldHits = [...t.matchAll(FIELD_LABEL)];
  const uniqueLabels = new Set(fieldHits.map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')));

  if (uniqueLabels.size >= 2) return true;

  if (uniqueLabels.size === 1) {
    const label = [...uniqueLabels][0];
    const strong =
      /^(product|customer|traveler|property|pnr|confirmation|record locator|check-in|check in)$/i.test(
        label,
      );
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (
      strong &&
      lines.length >= 2 &&
      /\b(hotel|flight|car|pnr|check[- ]?in|check[- ]?out|confirmation|customer|traveler|property|airline|reservation)\b/i.test(
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

  if (looksLikeBookingReservationText(combined)) return true;
  if (looksLikeBookingReservationText(text)) return true;

  // Known booking mailboxes + confirm-ish subject (templates printed as PDF).
  if (BOOKING_SENDER.test(from) && CONFIRM_SIGNAL.test(`${subject} ${text}`) && combined.length >= 40)
    return true;
  if (
    BOOKING_SENDER.test(from) &&
    TRAVEL_SIGNAL.test(`${subject} ${text}`) &&
    /\b(confirm|itinerary|reservation|trip|e-?ticket|pnr)\b/i.test(subject) &&
    combined.length >= 40
  )
    return true;

  return false;
}
