import { z } from 'zod';

const cents = z.number().int().min(0).max(9_000_000_000_000);
const safeText = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => !/\b(?:\d[ .-]?){16,19}\b/.test(v),
    'Use safe metadata only; never credentials or full account numbers',
  );
export const sourceProfileSchema = z.object({
  name: safeText.refine((v) => v.length > 0),
  source_method_id: z.string().uuid(),
  provider: safeText,
  holder_id: z.string().uuid().nullish(),
  safe_identifier: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !/\d{5}/.test(v))
    .default(''),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  notes: safeText.default(''),
});
export const flightSegment = z.object({
  origin: z.string().trim().min(1).max(100),
  destination: z.string().trim().min(1).max(100),
  date: z.iso.date(),
  flight_number: z.string().trim().max(100).optional(),
});
export const pricingSchema = z.object({
  method: z.enum(['Manual Customer Price', 'Percentage Off Comparable Online Price']),
  comparable_price: cents.optional(),
  discount_bps: z.number().int().min(0).max(10000).optional(),
  manual_override: z.boolean().default(false),
});
/** Exact rational arithmetic; final half-cent rounds up to the nearest cent. */
export function percentagePrice(comparable: number, bps: number) {
  cents.parse(comparable);
  z.number().int().min(0).max(10000).parse(bps);
  return Number((BigInt(comparable) * BigInt(10000 - bps) + 5000n) / 10000n);
}
export function percentageCommission(basis: number, bps: number) {
  cents.parse(basis);
  z.number().int().min(0).max(10000).parse(bps);
  const numerator = BigInt(basis) * BigInt(bps);
  if (numerator % 10000n)
    throw new Error('Commission produces fractional cents; enter the exact fixed dollar amount');
  return Number(numerator / 10000n);
}
export function validateSegments(segments: unknown, start: string, end: string) {
  const parsed = z.array(flightSegment).min(2).max(30).parse(segments);
  if (parsed.some((s, i) => i > 0 && s.date < parsed[i - 1].date))
    throw new Error('Multi-City segment dates must be in travel order');
  if (parsed[0].date !== start || parsed.at(-1)!.date !== end)
    throw new Error('Multi-City travel dates must match its first and last segments');
  return parsed;
}
export function sourceConfirmationLabel(name = '') {
  if (/gds/i.test(name)) return 'GDS Record / Confirmation';
  if (/amex/i.test(name)) return 'Amex Confirmation';
  if (/capital one/i.test(name)) return 'Capital One Confirmation';
  if (/award/i.test(name)) return 'Award / Program Confirmation';
  return 'Booking Source Confirmation';
}
export function latestCreditRequests(history: Record<string, any>[] = []) {
  const requests = new Map<string, Record<string, any>>();
  for (const event of history) if (event.request_id) requests.set(event.request_id, event);
  return [...requests.values()];
}
