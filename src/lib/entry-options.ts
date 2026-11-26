// Entry suggestions only: persisted accounting values and server rules are unchanged.

/** Plan v1 — first picker on New Booking (drives which few fields show). */
export const HOW_BOOKED_PRESETS = [
  'Cash / GDS',
  'Capital One',
  'Points (Padova-owned)',
  'Outside seller',
  'Hotel with commission',
  'Voucher / credit',
  'Hotel at program rate (FHR)',
  'Other',
] as const;
export type HowBookedPreset = (typeof HOW_BOOKED_PRESETS)[number];

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
/** Plan customer methods: card, Zelle, check, wire, cash, PayPal (+ ACH/Bank). List can grow. */
export const PAYMENT_METHODS = [
  'ACH',
  'Zelle',
  'Card',
  'Check',
  'Wire',
  'Bank',
  'Cash',
  'PayPal',
];

/** Plan: payment methods are a list the owner can extend — Other… for a new name. */
export const PAYMENT_METHOD_OTHER = 'Other…';

/**
 * Merge built-in payment methods with owner-used methods (existing payments, etc.).
 * Always ends with Other… Never invents money from the label.
 */
export function mergePaymentMethodOptions(
  extras: Array<string | null | undefined> = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const s = String(raw || '').trim();
    if (!s || s === PAYMENT_METHOD_OTHER || s === 'Other') return;
    const key = s.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const m of PAYMENT_METHODS) add(m);
  for (const e of extras) add(e);
  out.push(PAYMENT_METHOD_OTHER);
  return out;
}

/** Resolve form method (+ optional custom) to the stored name. */
export function resolvePaymentMethod(
  method: string | null | undefined,
  methodCustom?: string | null,
): string {
  const selected = String(method || '').trim();
  if (selected === PAYMENT_METHOD_OTHER || selected === 'Other') {
    const custom = String(methodCustom || '').trim();
    return custom ? custom.slice(0, 80) : '';
  }
  return selected;
}

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
] as const;

/** Plan: program names are a list the owner can add to — pick Other… and type the name. */
export const LOYALTY_PROGRAM_OTHER = 'Other…';

/**
 * Merge built-in loyalty/program names with owner-used names (programs table, asset issuers, etc.).
 * Always ends with Other… for a new name. Never invents money from the label.
 */
export function mergeLoyaltyProgramOptions(
  extras: Array<string | null | undefined> = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const s = String(raw || '').trim();
    if (!s || s === LOYALTY_PROGRAM_OTHER) return;
    const key = s.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const p of LOYALTY_PROGRAMS) add(p);
  for (const e of extras) add(e);
  out.push(LOYALTY_PROGRAM_OTHER);
  return out;
}

/** Resolve form program (+ optional custom) to the stored name. */
export function resolveLoyaltyProgram(
  program: string | null | undefined,
  programCustom?: string | null,
): string {
  const selected = String(program || '').trim();
  if (selected === LOYALTY_PROGRAM_OTHER || selected === 'Other') {
    const custom = String(programCustom || '').trim();
    return custom ? custom.slice(0, 80) : '';
  }
  return selected;
}

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
