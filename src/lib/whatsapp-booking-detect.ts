/**
 * Strict gate: WhatsApp → booking_draft only when the text looks like
 * real booking / reservation facts — not chatter, names alone, or unrelated chat.
 */

const FIELD_LABEL =
  /^(product|customer|traveler|guest|property|airline|seller|pnr|confirmation(?:\s*(?:#|no\.?|number))?|record\s*locator|check[- ]?in|check[- ]?out|pickup|drop[- ]?off|route|sale|total(?:\s*cost)?|booked\s*through|purchased\s*from|departure|arrival|trip\s*id|hotel\s*confirmation)\s*:/gim;

export function looksLikeBookingRelatedWhatsApp(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 20) return false;

  const fieldHits = [...t.matchAll(FIELD_LABEL)];
  const uniqueLabels = new Set(fieldHits.map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')));

  // Primary Padova path: Field:Value booking lines (need 2+ distinct labels).
  if (uniqueLabels.size >= 2) return true;

  // One strong label + another booking line/signal (e.g. Product: Hotel + route line).
  if (uniqueLabels.size === 1) {
    const label = [...uniqueLabels][0];
    const strong = /^(product|customer|traveler|property|pnr|confirmation|record locator|check-in|check in)$/i.test(
      label,
    );
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (strong && lines.length >= 2) {
      if (
        /\b(hotel|flight|car|pnr|check[- ]?in|check[- ]?out|confirmation|customer|traveler|property|airline|reservation)\b/i.test(
          t,
        )
      )
        return true;
    }
  }

  // Forwarded confirmation / itinerary paste (no Field:Value) — need confirm + travel + substance.
  const hasConfirm =
    /\b(confirmation|reservation confirmed|booking confirmation|itinerary|e-?ticket|travel reservation)\b/i.test(
      t,
    );
  const hasTravel =
    /\b(hotel|flight|airline|check[- ]?in|check[- ]?out|record locator|\bpnr\b|marriott|hilton|hyatt|united|delta|el al|amex travel|expedia|taap)\b/i.test(
      t,
    );
  if (hasConfirm && hasTravel && t.length >= 60) return true;

  return false;
}
