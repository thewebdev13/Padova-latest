/**
 * Soft hints from free-form booking email (subject/body) when Field: Value lines are missing.
 * Never invents sale amounts or ownership — only labels staff can see and edit.
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
  travel_start?: string;
  travel_end?: string;
};

const SUBJECT_PREFIX = /^(?:(?:fw|fwd|re|aw|sv)\s*:\s*)+/i;

/** “W Aspen — direct booking enquiry” / “Kona Village, A Rosewood Resort — …” */
const DIRECT_ENQUIRY =
  /^(.+?)\s*[—–\-|:]\s*direct\s+booking\s+(?:enquir|inquir)y\b/i;

const PURCHASE_REF =
  /\b(?:purchase[, ]+)?(?:reference|ref(?:erence)?\.?|confirmation|conf\.?|booking\s+ref(?:erence)?)\s*[#:]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i;

const GUEST_LINE =
  /\b(?:guest(?:s)?(?:\s*name)?|traveler(?:s)?|passenger(?:s)?|prepared\s+for|name\s+of\s+guest|reservation\s+for|booking\s+for|under\s+the\s+name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,60})/i;

/** “Rachel, you have a new inquiry” (Capital One Travel style). */
const GREETING_INQUIRY = /^([A-Z][a-zA-Z'-]{1,30}),\s+you\s+have\s+a\s+new\s+(?:inquir|enquir)y\b/i;

const HOTEL_SIGNAL =
  /\b(hotel|resort|spa|inn|suites?|lodge|rosewood|marriott|hilton|hyatt|st\.?\s*regis|aspen|nell|village)\b/i;

const FLIGHT_SIGNAL =
  /\b(flight|airline|e-?ticket|boarding|record\s*locator|\bpnr\b|itinerary)\b/i;

const AGENCY_IMPRINT = /^(shmuel\s+padawer|padova(\s+travels?)?|padova\s+travel)$/i;

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

function cleanLabel(raw: string) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”]+|[\s"'“”]+$/g, '')
    .trim();
}

function stripSubjectNoise(subject: string) {
  return cleanLabel(subject.replace(SUBJECT_PREFIX, ''));
}

function isUsablePersonName(name: string) {
  const n = cleanLabel(name);
  if (n.length < 2 || n.length > 60) return false;
  if (/^(unknown|n\/a|not applicable|guest|traveler|customer|sir|madam|team)$/i.test(n))
    return false;
  if (AGENCY_IMPRINT.test(n)) return false;
  if (!/[A-Za-z]{2}/.test(n)) return false;
  return true;
}

function toIsoDate(raw: string): string | undefined {
  const t = cleanLabel(raw).replace(/[.,]/g, ' ');
  const mdy = t.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+|\/|-|,?\s*)(\d{4})\b/i,
  );
  if (mdy) {
    const mm = MONTHS[mdy[1].toLowerCase()];
    if (mm) return `${mdy[3]}-${mm}-${mdy[2].padStart(2, '0')}`;
  }
  const iso = t.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const us = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  return undefined;
}

function labeledDate(text: string, labels: RegExp): string | undefined {
  const m = labels.exec(text);
  if (!m?.[1]) return undefined;
  return toIsoDate(m[1]) || undefined;
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
  if (greeting?.[1] && isUsablePersonName(greeting[1])) {
    hints.customer = cleanLabel(greeting[1]);
    if (!hints.product && /capital\s*one/i.test(from + combined)) hints.product = 'Other';
  }

  const guest = GUEST_LINE.exec(text) || GUEST_LINE.exec(combined);
  if (guest?.[1]) {
    const name = cleanLabel(guest[1].split(/[,\n]/)[0] || '');
    if (isUsablePersonName(name)) {
      hints.traveler = name;
      if (!hints.customer) hints.customer = name;
    }
  }

  const start =
    labeledDate(
      combined,
      /\b(?:check[- ]?in(?:\s*date)?|arrival(?:\s*date)?|travel\s*start|departure(?:\s*date)?)\s*[:\-]\s*([^\n]{4,40})/i,
    ) ||
    (() => {
      const range = combined.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—to]+\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})\b/i,
      );
      if (!range) return undefined;
      const mm = MONTHS[range[1].toLowerCase()];
      if (!mm) return undefined;
      return `${range[4]}-${mm}-${range[2].padStart(2, '0')}`;
    })();
  if (start) hints.travel_start = start;

  const end = labeledDate(
    combined,
    /\b(?:check[- ]?out(?:\s*date)?|departure(?:\s*date)?|travel\s*end|return(?:\s*date)?)\s*[:\-]\s*([^\n]{4,40})/i,
  );
  if (end) hints.travel_end = end;
  else if (start) {
    const range = combined.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—to]+\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})\b/i,
    );
    if (range) {
      const mm = MONTHS[range[1].toLowerCase()];
      if (mm) hints.travel_end = `${range[4]}-${mm}-${range[3].padStart(2, '0')}`;
    }
  }

  // Etihad EMD / fare-calc printouts (logo may be an image — branding text missing).
  const etihadFare = combined.match(/\b([A-Z]{3})\s+EY\s+([A-Z]{3})\d/i);
  if (etihadFare && etihadFare[1] !== etihadFare[2]) {
    if (!hints.route) hints.route = `${etihadFare[1].toUpperCase()}-${etihadFare[2].toUpperCase()}`;
    if (!hints.product) hints.product = 'Flight';
    if (!hints.airline) hints.airline = 'Etihad Airways';
  } else if (
    /booking\s*reference\s*:?\s*[A-Z0-9]{5,8}/i.test(combined) &&
    /receipt for your extras|pre reserved seat/i.test(combined)
  ) {
    if (!hints.product) hints.product = 'Flight';
    if (!hints.airline && /etihad/i.test(combined)) hints.airline = 'Etihad Airways';
  }

  if (!hints.product) {
    if (
      hints.property ||
      (HOTEL_SIGNAL.test(subject) && /\b(enquir|inquir|reservation|booking)\b/i.test(subject))
    )
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
  setIfEmpty('travel_start', hints.travel_start);
  setIfEmpty('travel_end', hints.travel_end);
  return out as T & Record<string, unknown>;
}

function filledString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when the draft has at least one usable booking field (never invent money). */
export function intakeDraftHasMinimumShape(input: {
  entry?: Record<string, unknown> | null;
  recognized_fields?: string[] | null;
}): boolean {
  const entry = input.entry || {};
  const values = [
    entry.product,
    entry.intake_customer_label,
    entry.route,
    entry.location,
    entry.primary_reference,
    entry.travel_start,
    entry.intake_provider_label,
  ];
  const filled = values.filter((v) => filledString(v)).length;
  if (filled >= 1) return true;
  return (input.recognized_fields?.length ?? 0) >= 1;
}

/**
 * Per-attachment drafts must carry real file facts — not only a PNR copied from the email subject.
 * Otherwise one forwarded purchase creates several empty :0/:1/:2 cards.
 */
export function intakeDraftHasAttachmentShape(input: {
  entry?: Record<string, unknown> | null;
  recognized_fields?: string[] | null;
}): boolean {
  const entry = input.entry || {};
  const strong = [
    entry.product,
    entry.intake_customer_label,
    entry.intake_traveler_label,
    entry.pending_traveler,
    entry.route,
    entry.location,
    entry.intake_provider_label,
    entry.travel_start,
  ].filter((v) => filledString(v));
  // PNR alone (often copied from the email subject) is not enough for a per-file draft.
  if (strong.length >= 1) return true;
  const recognized = new Set(input.recognized_fields || []);
  const strongKeys = [
    'product',
    'customer',
    'traveler',
    'route',
    'property',
    'airline',
    'travel_start',
  ];
  return strongKeys.some((k) => recognized.has(k));
}
