import { referenceKey } from './test-reference';
import { eligibleParty, type DirectoryRole } from './directory-eligibility';
import { redactOperationalText } from './operational-redaction';
import { normalizeReservationProseToPaste } from './intake-reservation-normalize';
import type { PaymentStatus } from './booking-entry-state';
type R = Record<string, any>;

/** Flexible Field: Value labels (Mindy Site Feedback 3). Longer keys win via sort. */
const labels: Record<string, string> = {
  customer: 'customer',
  'customer name': 'customer',
  client: 'customer',
  'client name': 'customer',
  'booked by': 'customer',
  'bill to': 'customer',
  'customer phone': 'customer_phone',
  'customer email': 'customer_email',
  'customer notes': 'customer_notes',
  'client phone': 'customer_phone',
  'client email': 'customer_email',
  'client notes': 'customer_notes',
  traveler: 'traveler',
  'traveler name': 'traveler',
  passenger: 'traveler',
  passengers: 'traveler',
  'passenger name': 'traveler',
  pax: 'traveler',
  guest: 'traveler',
  guests: 'traveler',
  'guest name': 'traveler',
  driver: 'traveler',
  product: 'product',
  'trip type': 'trip_type',
  airline: 'airline',
  property: 'property',
  hotel: 'property',
  route: 'route',
  location: 'route',
  city: 'route',
  destination: 'route',
  'from - to': 'route',
  'from – to': 'route',
  'from to': 'route',
  'hotel address': 'route',
  departure: 'travel_start',
  return: 'travel_end',
  'check-in': 'travel_start',
  'check in': 'travel_start',
  'check-out': 'travel_end',
  'check out': 'travel_end',
  'travel date': 'travel_start',
  // Client date aliases (location forms keep longer “pickup location” / “drop-off location”).
  'pick-up': 'travel_start',
  'pick up': 'travel_start',
  'pickup date': 'travel_start',
  'pick-up date': 'travel_start',
  'drop-off': 'travel_end',
  'drop off': 'travel_end',
  'dropoff date': 'travel_end',
  'drop-off date': 'travel_end',
  'airline pnr': 'primary_reference',
  'airline record locator': 'primary_reference',
  'carrier pnr': 'primary_reference',
  pnr: 'primary_reference',
  confirmation: 'primary_reference',
  'confirmation number': 'primary_reference',
  'confirmation #': 'primary_reference',
  'conf #': 'primary_reference',
  'booking reference': 'primary_reference',
  'booking reference number': 'primary_reference',
  'booking ref': 'primary_reference',
  'reservation number': 'primary_reference',
  'record locator': 'primary_reference',
  'sabre pnr': 'booking_source_confirmation',
  'sabre record locator': 'booking_source_confirmation',
  'gds pnr': 'booking_source_confirmation',
  'gds record locator': 'booking_source_confirmation',
  'agency pnr': 'booking_source_confirmation',
  'booking pnr': 'booking_source_confirmation',
  'booked through': 'method',
  'referring organization': 'referring_organization',
  'referring org': 'referring_organization',
  affiliate: 'referring_organization',
  'affiliate organization': 'referring_organization',
  'referred by': 'referring_organization',
  'referral organization': 'referring_organization',
  program: 'program',
  seller: 'seller',
  bought: 'bought',
  'seller cost': 'seller_cost',
  'seller paid': 'seller_paid',
  taxes: 'tax_amount',
  'taxes paid by': 'tax_bearer',
  card: 'account',
  // Longer “customer price” / “seller cost” win over short “price” / “cost”.
  'customer price': 'sale',
  price: 'sale',
  total: 'sale',
  amount: 'sale',
  rate: 'sale',
  cost: 'sale',
  'customer paid': 'customer_paid',
  'amount received': 'received',
  'customer received': 'received',
  'seller amount paid': 'seller_amount_paid',
  'flight numbers': 'flight_numbers',
  'ticket numbers': 'ticket_numbers',
  cabin: 'cabin',
  'room type': 'room_type',
  pickup: 'pickup_location',
  'pickup location': 'pickup_location',
  'dropoff location': 'dropoff_location',
  'drop-off location': 'dropoff_location',
  notes: 'notes',
  summary: 'reservation_summary',
  'what is it': 'description',
  'booking source confirmation': 'booking_source_confirmation',
  'source account/profile': 'source_profile',
  'points/miles quantity': 'points_quantity',
  'agreed rate': 'quoted_rate',
  'cost per point': 'quoted_rate',
  'rate unit': 'rate_unit',
  'per-point unit': 'rate_unit',
  'account email': 'account_email',
  'account email used': 'account_email',
  'points account email': 'account_email',
};

const MONEY_KEYS = new Set([
  'sale',
  'seller_cost',
  'tax_amount',
  'received',
  'seller_amount_paid',
  'quoted_rate',
]);

/** Strip $ / commas for paste money; do not invent amounts. */
export function normalizePasteMoney(value: string): string {
  const trimmed = value.trim();
  if (!/^\$?\s*-?\d/.test(trimmed)) return trimmed;
  return trimmed.replace(/^\$\s*/, '').replace(/,/g, '').trim();
}

export type PastePreview = {
  fields: R;
  /** Canonical field key → original label that set it (for intake preview). */
  fieldSources: Record<string, string>;
  unknown: { label: string; value: string }[];
  issues: string[];
};

/** Deterministic Field: Value protocol. No network/AI, creation or posting. */
export function parseQuickPaste(raw: string): PastePreview {
  const fields: R = {},
    fieldSources: Record<string, string> = {},
    unknown: PastePreview['unknown'] = [],
    issues: string[] = [];
  // Capital One / reservation email PDFs → Field: Value first (no invented customer/paid).
  const input = redactOperationalText(normalizeReservationProseToPaste(raw)).slice(0, 20000);
  const known = Object.keys(labels)
    .sort((a, b) => b.length - a.length)
    .join('|');
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const matches = [...line.matchAll(new RegExp(`(?:^|\\s+)(${known}):[ \\t]*`, 'gi'))];
    const prefix = line.slice(0, matches[0]?.index ?? line.length).trim();
    if (prefix) {
      const named = prefix.match(/^([A-Za-z][A-Za-z #/.-]{0,40}):\s*(.*)$/);
      unknown.push(
        named
          ? { label: named[1], value: named[2] }
          : { label: 'Unparsed / Needs Review', value: prefix },
      );
    }
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i],
        label = m[1].trim(),
        rawValue = line.slice(m.index! + m[0].length, matches[i + 1]?.index ?? line.length).trim(),
        key = labels[label.toLowerCase()];
      const value = MONEY_KEYS.has(key) ? normalizePasteMoney(rawValue) : rawValue;
      if (fields[key] !== undefined) {
        issues.push(`Repeated ${label}; review before applying`);
        unknown.push({ label: `Repeated ${label} / Needs Review`, value: rawValue });
      } else if (!/^(unknown|not applicable|n\/a)$/i.test(value)) {
        fields[key] = value;
        fieldSources[key] = label;
      }
    }
  }
  for (const [key, label, amount] of [
    ['customer_paid', 'Customer Paid', 'received'],
    ['seller_paid', 'Seller Paid', 'seller_amount_paid'],
  ]) {
    if (fields[key] === undefined) continue;
    const status = parsePaymentStatus(fields[key]);
    if (!status)
      issues.push(
        `${label}: unsupported status “${fields[key]}”, unresolved; no payment is proposed`,
      );
    if (status === 'Partial' && !fields[amount])
      issues.push(`${label}: Partial requires an actual amount paid/received`);
    if (status === 'Unpaid' && fields[amount] && fields[amount] !== '0')
      issues.push(`${label}: Unpaid conflicts with an amount; no payment is proposed`);
  }
  if (fields.bought !== undefined && !parseBoughtValue(fields.bought))
    issues.push(`Bought: “${fields.bought}” is unresolved; choose what was supplied`);
  if (
    (!fields.product || normalizePasteValue(fields.product) === 'flight') &&
    normalizePasteValue(fields.trip_type ?? '') === 'one way' &&
    fields.travel_end
  )
    issues.push(
      'Contradiction: One Way with Return Date. Return is not applied; review the Trip Type and Return line.',
    );
  return { fields, fieldSources, unknown, issues };
}
export const normalizePasteValue = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function parsePaymentStatus(value: string): PaymentStatus | undefined {
  switch (normalizePasteValue(value)) {
    case 'paid':
    case 'yes':
      return 'Paid';
    case 'unpaid':
    case 'no':
      return 'Unpaid';
    case 'partial':
      return 'Partial';
    default:
      return undefined;
  }
}
export function parseBoughtValue(
  value: string,
): { supplied: string; unit: string; quantity?: string } | undefined {
  const text = normalizePasteValue(value);
  const types: Record<string, string> = {
    points: 'Points / Miles',
    miles: 'Points / Miles',
    voucher: 'Voucher / Travel Credit',
    'travel credit': 'Voucher / Travel Credit',
    certificate: 'Certificate / Award',
    'complete booking': 'Complete Booking / Ticket',
  };
  const type = Object.hasOwn(types, text) ? types[text] : undefined;
  if (type)
    return {
      supplied: type,
      unit:
        type === 'Points / Miles' ? 'points' : type === 'Certificate / Award' ? 'count' : 'money',
    };
  const quantity = text.match(/^(\d+|\d{1,3}(?:,\d{3})+)\s+(?:points?|miles?)$/);
  if (quantity && Number(quantity[1].replaceAll(',', '')) > 0)
    return {
      supplied: 'Points / Miles',
      unit: 'points',
      quantity: quantity[1].replaceAll(',', ''),
    };
}
export function exactEligibleMatch(rows: R[], label: string, role?: DirectoryRole) {
  const matches = rows.filter(
    (r) => referenceKey(r.name) === referenceKey(label) && (!role || eligibleParty(r, role)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function exactPointCost(quantity: number, rate: string, unit: string): number {
  if (!['USD per point', 'USD per 1,000 points', 'cents per point'].includes(unit))
    throw new Error('Choose an explicit point-rate unit');
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !/^\d+(\.\d{1,8})?$/.test(rate))
    throw new Error('Enter whole quantity and exact positive rate');
  const [whole, fraction = ''] = rate.split('.');
  const numerator = BigInt(quantity) * BigInt(whole + fraction) * 100n;
  const denominator =
    10n ** BigInt(fraction.length) *
    (unit === 'USD per 1,000 points' ? 1000n : unit === 'cents per point' ? 100n : 1n);
  if (numerator % denominator)
    throw new Error('Rate produces fractional cents; use an agreed fixed dollar cost');
  const cents = Number(numerator / denominator);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 9_000_000_000_000)
    throw new Error('Invalid point cost');
  return cents;
}

export const quickPasteAIInstructions = `Extract booking information for Padova. Do not invent or infer missing facts, payments, ownership or costs. Use Unknown when unknown. Output ONLY the exact Field: Value lines below, one field per line, no markdown or commentary. Use dates YYYY-MM-DD and money as plain USD decimals. Use Product Flight, Hotel, Car or Other; Trip Type One Way, Round Trip or Multi-City. For Multi-City retain every segment in Summary for human review. Customer Paid and Seller Paid must be exactly Paid, Partial, Unpaid or Unknown, and actual amounts must be evidence-based. Keep reservation facts in Summary and operational notes in Notes. Never output credentials or full card/account numbers. Keep booking source account/profile separate from the card that paid. Rate unit defaults to cents per point.

Route rules: for a round trip put Trip Type Round Trip and Route as ORIGIN-DESTINATION only (example TLV-BCN), never ORIGIN-DEST-ORIGIN (never TLV-BCN-TLV). Airline PNR is the operating airline / carrier record locator only — never put Sabre, Amadeus, Travelport, or other GDS / agency locators in Airline PNR; those go in Booking Source Confirmation.

Supply these labels:
Customer: Unknown
Customer Phone: Unknown
Customer Email: Unknown
Customer Notes: Unknown
Traveler: Unknown
Product: Unknown
Trip Type: Unknown
Airline: Unknown
Property: Unknown
Route: Unknown
Departure: Unknown
Return: Unknown
Airline PNR: Unknown
Cabin: Unknown
Confirmation #: Unknown
Flight Numbers: Unknown
Booked Through: Unknown
Referring Organization: Unknown
Booking Source Confirmation: Unknown
Source Account/Profile: Unknown
Program: Unknown
Seller: Unknown
Bought: Unknown
Points/Miles Quantity: Unknown
Cost Per Point: Unknown
Rate Unit: cents per point
Account Email Used: Unknown
Seller Cost: Unknown
Seller Paid: Unknown
Seller Amount Paid: Unknown
Taxes: Unknown
Taxes Paid By: Unknown
Card: Unknown
Customer Price: Unknown
Customer Paid: Unknown
Amount Received: Unknown
Summary: Unknown
Notes: Unknown

Extract the booking information I provide next.`;

export const quickPasteExample = `Customer: QA Sample Customer
Traveler: QA Sample Traveler
Product: Flight
Trip Type: Round Trip
Airline: Delta Air Lines
Route: JFK-ATL
Departure: 2027-02-01
Return: 2027-02-05
Airline PNR: DL9ABC
Cabin: Business
Booked Through: Award Booking
Referring Organization: Unknown
Booking Source Confirmation: SABRE-SAMPLE
Source Account/Profile: Unknown
Program: Delta SkyMiles
Seller: QA Sample Seller
Bought: miles
Points/Miles Quantity: 13000
Cost Per Point: 1.30
Rate Unit: cents per point
Account Email Used: Unknown
Seller Cost: 169.00
Seller Paid: Unpaid
Taxes: 0
Taxes Paid By: Included in Seller Price
Customer Price: 300.00
Customer Paid: Unpaid
Summary: Round-trip Delta award, 13,000 miles.
Notes: Synthetic example; select your own matching records before Save.`;
