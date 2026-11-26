import { entryDocumentDraftStarted } from './booking-documents';
import { parseList } from './entry-options';
import { entryExtraIncomeDraftStarted } from './standing-deals';

type Values = Record<string, any>;
const productFields: Record<string, string[]> = {
  Flight: [
    'route',
    'origin',
    'destination',
    'flight_numbers',
    'ticket_numbers',
    'cabin',
    'additional_airlines',
    'ticketing_status',
    'airline_id',
    'marketing_carrier_id',
    'operating_carrier_id',
    'trip_type',
    'segments',
  ],
  Hotel: ['location', 'hotel', 'hotel_name', 'hotel_address', 'brand', 'room_type', 'benefits'],
  Car: ['pickup_location', 'dropoff_location', 'pickup_time', 'dropoff_time'],
  Other: ['description'],
};
/** Both manual changes and paste application clear the same inapplicable state. */
export function transitionBookingProduct(
  values: Values,
  product: string,
  methods: Values[] = [],
): Values {
  const next: Values = { ...values, product };
  if (values.product !== product) {
    next.provider_id = '';
    next.primary_reference = '';
    next.travel_end = '';
    delete next.product_drafts;
  }
  for (const [owner, keys] of Object.entries(productFields))
    if (owner !== product) for (const key of keys) delete next[key];
  if (product === 'Flight') {
    next.trip_type ??= 'One Way';
    if (next.trip_type === 'One Way') next.travel_end = '';
  }
  if (product !== 'Hotel')
    for (const key of Object.keys(next)) if (key.startsWith('commission_')) delete next[key];
  const method = methods.find((m) => m.id === next.source_method_id);
  if (!method?.products.includes(product)) {
    next.source_method_id = '';
    next.award_program_id = '';
    next.source_profile_id = '';
  } else if (!method.award) next.award_program_id = '';
  return next;
}
export function bookingProductDetails(v: Values, providerName?: string): Values {
  if (v.product === 'Flight')
    return {
      trip_type: v.trip_type,
      segments: v.trip_type === 'Multi-City' ? v.segments : undefined,
      route:
        v.trip_type === 'Multi-City'
          ? (v.segments ?? []).map((s: Values) => `${s.origin}-${s.destination}`).join(' / ')
          : v.route || undefined,
      flight_numbers:
        v.trip_type === 'Multi-City'
          ? (v.segments ?? []).map((s: Values) => s.flight_number).filter(Boolean)
          : parseList(v.flight_numbers),
      ticket_numbers: parseList(v.ticket_numbers),
      cabin: v.cabin || undefined,
      additional_airlines: v.additional_airlines || undefined,
      ticketing_status: v.ticketing_status || undefined,
    };
  if (v.product === 'Hotel')
    return {
      hotel: providerName,
      hotel_address: v.location || undefined,
      room_type: v.room_type || undefined,
    };
  if (v.product === 'Car')
    return {
      pickup_location: v.pickup_location || undefined,
      dropoff_location: v.dropoff_location || undefined,
      departure_local:
        v.pickup_time && v.travel_start
          ? `${v.travel_start}T${v.pickup_time.slice(-5)}`
          : undefined,
      arrival_local:
        v.dropoff_time && (v.travel_end || v.travel_start)
          ? `${v.travel_end || v.travel_start}T${v.dropoff_time.slice(-5)}`
          : undefined,
    };
  return v.product === 'Other' ? { description: v.description || undefined } : {};
}
const present = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  !(Array.isArray(value) && value.length === 0);
/** Reject forged hidden product data, independently of UI normalization. */
export function assertBookingProductData(product: string, details: Values, refs: Values[] = []) {
  if (!['Flight', 'Hotel', 'Car', 'Other'].includes(product)) return; // Existing combined-product history remains supported.
  if (!['Flight', 'Car'].includes(product))
    for (const key of ['departure_local', 'arrival_local'])
      if (present(details[key])) throw new Error(`${key} is incompatible with ${product}`);
  for (const [owner, keys] of Object.entries(productFields)) {
    if (owner === product) continue;
    for (const key of keys)
      if (present(details[key])) throw new Error(`${key} is incompatible with ${product}`);
  }
  for (const ref of refs) {
    const owner =
      ref.type === 'airline_pnr' || ref.type === 'ticket_number'
        ? 'Flight'
        : ref.type === 'hotel_confirmation'
          ? 'Hotel'
          : ref.type === 'car_confirmation'
            ? 'Car'
            : undefined;
    if (owner && owner !== product) throw new Error(`${ref.type} is incompatible with ${product}`);
  }
}
export type PaymentStatus = 'Paid' | 'Unpaid' | 'Partial';
/** Intents may default a full payment; actual entered amounts always determine status. */
export function sellerPaymentState(
  cost: number | undefined,
  enteredPaid: number | undefined,
  intent: string,
) {
  const paid = enteredPaid ?? (intent === 'Paid' ? (cost ?? 0) : 0);
  const payment_known = enteredPaid !== undefined || (intent === 'Paid' && cost !== undefined);
  const balance = cost === undefined ? undefined : cost - paid;
  const status =
    cost === undefined
      ? 'Unknown'
      : paid > cost
        ? 'Needs Review'
        : cost === 0
          ? 'No payment due'
          : paid === 0
            ? 'Unpaid'
            : balance === 0
              ? 'Paid'
              : 'Partial';
  return { paid, balance, status, payment_known };
}
export function customerReceivedAmount(
  status: string,
  entered: number | undefined,
  total: number,
  manuallyEntered: boolean,
) {
  if (status === 'Unpaid' || !['Paid', 'Partial'].includes(status)) return 0;
  return status === 'Paid' && !manuallyEntered ? total : (entered ?? 0);
}
export function taxesCreateFunding(tax: Values | undefined) {
  return (
    !!tax?.amount &&
    !tax.included_in_component &&
    (tax.bearer === 'Padova' || (tax.bearer === 'Seller' && tax.owed_to_seller))
  );
}

/** Plan v1 short New Booking path — five primary sections (rare fields live in More). */
export const BOOKING_ENTRY_PRIMARY_NAV = [
  { id: 'customer', label: 'Customer' },
  { id: 'travel', label: 'Travel' },
  { id: 'how', label: 'How booked' },
  { id: 'money', label: 'Price & cost' },
  { id: 'more', label: 'More' },
] as const;

export function bookingEntryPrimaryNav() {
  return BOOKING_ENTRY_PRIMARY_NAV.map((step) => ({ ...step }));
}

/** Open More when a rare Plan field already has a value (Unknown ≠ invent). */
export function bookingEntryMoreShouldOpen(v: Values): boolean {
  return Boolean(
    v.referring_organization_id ||
      v.held_pnr ||
      v.ticketing_deadline ||
      v.program_rate_name ||
      v.program_perks ||
      v.program_benefit_gained ||
      v.additional_charge ||
      (typeof v.additional_charge_note === 'string' && v.additional_charge_note.trim()) ||
      (typeof v.notes === 'string' && v.notes.trim()) ||
      (typeof v.price_breakdown_note === 'string' && v.price_breakdown_note.trim()) ||
      v.summary_override ||
      entryDocumentDraftStarted(v) ||
      entryExtraIncomeDraftStarted(v) ||
      (typeof v.tax_amount === 'string' && v.tax_amount.trim()) ||
      (typeof v.tax_amount === 'number' && Number.isFinite(v.tax_amount)) ||
      (v.tax_bearer && v.tax_bearer !== 'Unknown'),
  );
}

/**
 * Plan short Travel: cabin / flight # / tickets / room / times stay collapsed.
 * Open when any of those rare fields already has a value (Unknown ≠ invent).
 */
export function bookingTravelMoreShouldOpen(v: Values): boolean {
  const present = (x: unknown) => typeof x === 'string' && !!x.trim();
  return Boolean(
    present(v.cabin) ||
      present(v.flight_numbers) ||
      present(v.ticket_numbers) ||
      present(v.additional_airlines) ||
      present(v.room_type) ||
      present(v.pickup_time) ||
      present(v.dropoff_time) ||
      (Array.isArray(v.provider_references) &&
        v.provider_references.some(
          (r: Values) => present(r?.value) || present(r?.provider_id),
        )) ||
      (v.ticketing_status &&
        v.ticketing_status !== 'Not Ticketed / Unknown' &&
        present(v.ticketing_status)),
  );
}

/**
 * Plan short Price: typed Manual sale is primary.
 * Percent-off / comparable online stays collapsed until chosen or filled.
 */
export function bookingPercentPricingShouldOpen(v: Values): boolean {
  const present = (x: unknown) =>
    (typeof x === 'string' && !!x.trim()) ||
    (typeof x === 'number' && Number.isFinite(x));
  return Boolean(
    v.pricing_method === 'Percentage Off Comparable Online Price' ||
      present(v.comparable_price) ||
      present(v.discount_percent) ||
      v.price_override ||
      v.record_comparable,
  );
}

/**
 * Plan Fixed Margin stays collapsed until chosen or a margin is typed.
 * Same as Cost is a one-tap seed (not this panel).
 */
export function bookingFixedMarginShouldOpen(v: Values): boolean {
  const present = (x: unknown) =>
    (typeof x === 'string' && !!x.trim()) ||
    (typeof x === 'number' && Number.isFinite(x));
  return Boolean(v.pricing_method === 'Fixed Margin' || present(v.fixed_margin));
}

const textPresent = (x: unknown) => typeof x === 'string' && !!x.trim();

/** Plan More: FHR / program rate fields stay collapsed until filled. */
export function bookingEntryFhrMoreShouldOpen(v: Values): boolean {
  return Boolean(
    textPresent(v.program_rate_name) ||
      textPresent(v.program_perks) ||
      textPresent(v.program_benefit_gained),
  );
}

/** Plan More: Held PNR stays collapsed until hold is checked or deadline set. */
export function bookingEntryHeldMoreShouldOpen(v: Values): boolean {
  return Boolean(v.held_pnr || textPresent(v.ticketing_deadline));
}

/** Plan More: notes / summary stay collapsed until edited or noted. */
export function bookingEntryNotesMoreShouldOpen(v: Values): boolean {
  return Boolean(
    v.summary_override ||
      textPresent(v.notes) ||
      textPresent(v.price_breakdown_note) ||
      textPresent(v.reservation_summary),
  );
}
