// Entry suggestions only: persisted accounting values and server rules are unchanged.
export const BOOKING_CHANNELS = [
  'GDS',
  'Direct Airline',
  'Direct Hotel',
  'Expedia TAAP',
  'BedsOnline',
  'Capital One',
  'Award Program',
  'Seller / Source Partner',
  'OTA',
  'Consolidator',
  'Another Agency',
  'Unknown',
];
export const PAYMENT_METHODS = ['ACH', 'Zelle', 'Card', 'Check', 'Wire', 'Bank', 'Cash'];
export const FUNDING_KINDS = [
  'Card',
  'Cash',
  'Bank',
  'Voucher',
  'Airline credit',
  'Hotel credit',
  'Capital One credit',
  'Gift card',
  'Points',
  'Seller-funded reservation',
];
export const PARTY_ROLES = [
  'customer',
  'traveler',
  'payer',
  'employee',
  'supplier',
  'seller',
  'referrer',
  'partner',
];
export const LOYALTY_PROGRAMS = [
  'American AAdvantage',
  'United MileagePlus',
  'Delta SkyMiles',
  'Flying Blue',
  'El Al Matmid',
  'Amex Membership Rewards',
  'Chase Ultimate Rewards',
  'Capital One',
  'Hilton Honors',
  'World of Hyatt',
  'Marriott Bonvoy',
];
export const SEAT_PREFERENCES = ['Window', 'Aisle', 'Middle', 'No preference'];
export function parseList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[,\n]+/);
  return [...new Set(items.map((s) => String(s).trim()).filter(Boolean))];
}
export function decimalUnits(value: unknown, whole = false, signed = false): number {
  const text = String(value).trim();
  if (!(whole ? /^\d+$/ : signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(text))
    throw new Error(whole ? 'Use whole units' : 'Use an amount with at most two decimals');
  const negative = text.startsWith('-');
  const [dollars, fraction = ''] = text.replace(/^-/, '').split('.');
  const result = whole ? Number(dollars) : Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Amount is too large');
  return negative ? -result : result;
}
export function isDirectBookingChannel(channel: string) {
  return ['direct', 'direct airline', 'direct hotel'].includes(channel.trim().toLowerCase());
}
