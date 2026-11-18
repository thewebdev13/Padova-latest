/**
 * Soft hints from free-form booking email (subject/body) when Field: Value lines are missing.
 * Never invents sale amounts, dates, or ownership — only labels staff can see and edit.
 */

export type LooseIntakeHints = {
  product?: 'Flight' | 'Hotel' | 'Car' | 'Other';
  /** Hotel / place name shown as Route / place on draft cards. */
  route?: string;
  property?: string;
  customer?: string;
  traveler?: string;
  primary_reference?: string;
  airline?: string;
};

const SUBJECT_PREFIX = /^(?:(?:fw|fwd|re|aw|sv)\s*:\s*)+/i;

/** “W Aspen — direct booking enquiry” / “Kona Village, A Rosewood Resort — …” */
const DIRECT_ENQUIRY =
  /^(.+?)\s*[—–\-|:]\s*direct\s+booking\s+(?:enquir|inquir)y\b/i;

const PURCHASE_REF =
  /\b(?:purchase[, ]+)?(?:reference|ref(?:erence)?\.?|confirmation|conf\.?|booking\s+ref(?:erence)?)\s*[#:]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i;

const GUEST_LINE =
  /\b(?:guest(?:\s*name)?|traveler|passenger|prepared\s+for|name\s+of\s+guest)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,60})/i;

/** “Rachel, you have a new inquiry” (Capital One Travel style). */
const GREETING_INQUIRY = /^([A-Z][a-zA-Z'-]{1,30}),\s+you\s+have\s+a\s+new\s+(?:inquir|enquir)y\b/i;

const HOTEL_SIGNAL =
  /\b(hotel|resort|spa|inn|suites?|lodge|rosewood|marriott|hilton|hyatt|st\.?\s*regis|aspen|nell|village)\b/i;

const FLIGHT_SIGNAL =
  /\b(flight|airline|e-?ticket|boarding|record\s*locator|\bpnr\b|itinerary)\b/i;

function cleanLabel(raw: string) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”]+|[\s"'“”]+$/g, '')
    .trim();
}

function stripSubjectNoise(subject: string) {
  return cleanLabel(subject.replace(SUBJECT_PREFIX, ''));
}

/**
 * Infer display/prefill hints from email subject + body.
 * Empty object when nothing reliable is found. Never sets sale / money fields.
 */
export function inferLooseIntakeHints(input: {
  subject?: string;
  text?: string;
  from_address?: string;
}): LooseIntakeHints {
  const subject = stripSubjectNoise(String(input.subject || ''));
  const text = String(input.text || '').trim();
  const from = String(input.from_address || '').trim();
  const combined = `${subject}\n${text}`;
  const hints: LooseIntakeHints = {};

  const enquiry = DIRECT_ENQUIRY.exec(subject);
  if (enquiry?.[1]) {
    const property = cleanLabel(enquiry[1]);
    if (property.length >= 2) {
      hints.property = property;
      hints.route = property;
      hints.product = 'Hotel';
    }
  }

  const purchaseRef = PURCHASE_REF.exec(subject) || PURCHASE_REF.exec(combined);
  if (purchaseRef?.[1]) {
    const ref = purchaseRef[1].toUpperCase();
    // Avoid matching bare years / tiny tokens
    if (!/^(19|20)\d{2}$/.test(ref) && ref.length >= 4) {
      hints.primary_reference = ref;
    }
  }

  if (/\bthanks for your purchase\b/i.test(subject) || /\bthanks for your purchase\b/i.test(text)) {
    if (!hints.product) {
      if (HOTEL_SIGNAL.test(combined)) hints.product = 'Hotel';
      else if (FLIGHT_SIGNAL.test(combined)) hints.product = 'Flight';
      else if (/\bcar\s+rental|rental\s+car\b/i.test(combined)) hints.product = 'Car';
    }
  }

  const greeting = GREETING_INQUIRY.exec(subject);
  if (greeting?.[1]) {
    hints.customer = cleanLabel(greeting[1]);
    if (!hints.product && /capital\s*one/i.test(from + combined)) hints.product = 'Other';
  }

  const guest = GUEST_LINE.exec(text);
  if (guest?.[1]) {
    const name = cleanLabel(guest[1].split(/\n/)[0] || '');
    if (name.length >= 2 && !/^(unknown|n\/a|not applicable)$/i.test(name)) {
      hints.traveler = name;
      if (!hints.customer) hints.customer = name;
    }
  }

  if (!hints.product) {
    if (hints.property || (HOTEL_SIGNAL.test(subject) && /\b(enquir|inquir|reservation|booking)\b/i.test(subject)))
      hints.product = 'Hotel';
    else if (/\bdelta|united|american airlines|el al\b/i.test(from) && FLIGHT_SIGNAL.test(combined))
      hints.product = 'Flight';
  }

  if (!hints.airline && /\bdelta\b/i.test(from)) hints.airline = 'Delta';
  if (!hints.airline && /\bunited\b/i.test(from)) hints.airline = 'United';

  return hints;
}

/** Merge loose hints into already-parsed Field: Value fields (parsed wins). */
export function mergeLooseIntakeHints<T extends Record<string, unknown>>(
  fields: T,
  hints: LooseIntakeHints,
): T & Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  const setIfEmpty = (key: string, value: string | undefined) => {
    if (!value) return;
    const cur = out[key];
    if (cur == null || cur === '') out[key] = value;
  };
  setIfEmpty('product', hints.product);
  setIfEmpty('route', hints.route);
  setIfEmpty('property', hints.property);
  setIfEmpty('customer', hints.customer);
  setIfEmpty('traveler', hints.traveler);
  setIfEmpty('primary_reference', hints.primary_reference);
  setIfEmpty('airline', hints.airline);
  return out as T & Record<string, unknown>;
}
