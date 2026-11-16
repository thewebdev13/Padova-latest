import { z } from 'zod';
import { flightSegment } from './v1-entry';
import { one, type SQL, type Row } from './db';
import { unitSchema } from './asset-units';
import { itineraryEntryKeys } from './booking-itinerary';
export { unitSchema, assetUnit, formatQuantity } from './asset-units';

export async function effectiveFulfillments(tx: SQL, booking_id: string) {
  const rows = (
    await tx.query(
      `SELECT d.*,i.name instrument,f.cost,f.asset_id,f.account_id,f.reference,a.ownership asset_ownership,
    edit.result correction,
    (SELECT count(*) FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment')
      AND c.result IS NOT NULL AND c.payload->>'fulfillment_id'=d.id::text) edit_version
    FROM fulfillment_details d LEFT JOIN instruments i ON i.id=d.instrument_id
    JOIN funding_components f ON f.id=d.funding_component_id
    LEFT JOIN assets a ON a.id=f.asset_id
    LEFT JOIN LATERAL(SELECT c.result FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment')
      AND c.result IS NOT NULL AND c.payload->>'fulfillment_id'=d.id::text ORDER BY c.created_at DESC,c.id DESC LIMIT 1) edit ON true
    WHERE d.booking_id=$1 ORDER BY d.created_at,d.id`,
      [booking_id],
    )
  ).rows;
  return rows.map(({ correction, ...row }) =>
    correction?.reversed_funding_id === row.funding_component_id
      ? {
          ...row,
          status: correction.replacement_fulfillment_id ? 'Replaced' : 'Reversed',
          replacement_fulfillment_id: correction.replacement_fulfillment_id,
        }
      : { ...row, ...correction, status: 'Active', edit_version: Number(row.edit_version) },
  );
}

// Installed travel rows are immutable. Booking revisions project over the
// initial single-product component while preserving its original stored row.
export async function effectiveTravelComponents(
  tx: SQL,
  booking_id?: string,
  currentRevision?: Row,
) {
  const rows = (
    await tx.query(
      `SELECT t.*,b.code,
    b.reservation_status booking_status,count(*) OVER(PARTITION BY t.booking_id) component_count,
    (SELECT array_agg(person_id) FROM booking_travelers WHERE booking_id=b.id AND status='Active') active_traveler_ids,
    ARRAY(SELECT DISTINCT ref.value FROM commands history CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(history.payload->'confirmations')='array' THEN history.payload->'confirmations' ELSE '[]'::jsonb END) ref(value) WHERE history.kind='revise' AND history.payload->>'booking_id'=b.id::text) revision_references,
    CASE WHEN EXISTS(SELECT 1 FROM commands x WHERE x.kind='cancel' AND x.payload->>'travel_component_id'=t.id::text) THEN 'Cancelled'
      WHEN b.reservation_status IN ('Cancelled','Refund Pending','Traveled') THEN b.reservation_status ELSE 'Booked' END status,
    (origin.kind='booking' AND origin.payload->>'create_initial_travel'='true') initial_component,
    rev.result revised_booking,rev.payload revised_payload,rev.created_at revised_at,
    edit.result component_edit,edit.created_at component_at,
    (SELECT count(*) FROM commands h WHERE h.kind='revise_travel' AND h.result IS NOT NULL AND h.payload->>'travel_component_id'=t.id::text) edit_version
    FROM travel_components t JOIN bookings b ON b.id=t.booking_id
    JOIN commands origin ON origin.id=t.command_id
    LEFT JOIN LATERAL(SELECT c.result,c.payload,c.created_at FROM commands c WHERE c.kind='revise'
      AND c.payload->>'booking_id'=t.booking_id::text AND c.result IS NOT NULL
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1) rev ON true
    LEFT JOIN LATERAL(SELECT c.result,c.created_at FROM commands c WHERE c.kind='revise_travel'
      AND c.payload->>'travel_component_id'=t.id::text AND c.result IS NOT NULL
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1) edit ON true
    WHERE ($1::uuid IS NULL OR t.booking_id=$1) ORDER BY t.created_at,t.id`,
      [booking_id ?? null],
    )
  ).rows;
  const activeCounts = new Map<string, number>();
  for (const row of rows)
    if (!['Cancelled', 'Refund Pending'].includes(row.status))
      activeCounts.set(row.booking_id, (activeCounts.get(row.booking_id) ?? 0) + 1);
  return rows.map(
    ({
      initial_component,
      revised_booking,
      revised_payload,
      component_edit,
      revised_at,
      component_at,
      component_count,
      active_traveler_ids,
      revision_references,
      ...travel
    }) => {
      const single = Number(component_count) === 1 || activeCounts.get(travel.booking_id) === 1;
      const bookingWins =
        single &&
        (currentRevision || (revised_at && (!component_at || revised_at >= component_at)));
      if (component_edit && !bookingWins)
        return {
          ...travel,
          ...component_edit,
          status: travel.status,
          edit_version: Number(travel.edit_version),
        };
      const revised = currentRevision ?? revised_booking;
      if ((!initial_component && !single) || !revised || travel.status === 'Cancelled')
        return travel;
      const itinerary = revised.itinerary ?? {};
      return {
        ...travel,
        summary: revised.summary,
        product: ['Flight', 'Hotel', 'Car', 'Other'].includes(revised.product)
          ? revised.product
          : travel.product,
        provider_id: itinerary.airline_id ?? itinerary.provider_id ?? travel.provider_id,
        channel: revised.channel,
        acquisition_source_id: itinerary.acquisition_source_id,
        travel_start: revised.travel_start,
        travel_end: revised.travel_end,
        details: {
          ...travel.details,
          end_date_known: itinerary.end_date_known ?? travel.details.end_date_known,
          summary_generated: itinerary.summary_generated ?? travel.details.summary_generated,
          reservation_summary:
            itinerary.reservation_summary ??
            (travel.details.reservation_summary_generated
              ? revised.summary
              : travel.details.reservation_summary),
          ...Object.fromEntries(
            itineraryEntryKeys
              .filter((key) => itinerary[key] !== undefined)
              .map((key) => [key, itinerary[key]]),
          ),
          confirmations: [
            ...new Set([
              ...(travel.details.confirmations ?? []),
              ...(single ? (revision_references ?? []) : []),
              ...(revised_payload?.confirmations ?? []),
            ]),
          ],
          traveler_ids: single ? (active_traveler_ids ?? []) : (travel.details.traveler_ids ?? []),
        },
      };
    },
  );
}

const id = z.string().uuid();
const text = z.string().trim().min(1).max(200);
const quantity = z.number().int().positive().max(9_000_000_000_000);
export const instrumentRules = z
  .object({
    restrictions: z.string().max(2000).optional(),
    rebate_bps: z.number().int().min(0).max(10000).optional(),
    redemption_cents_numerator: quantity.optional(),
    redemption_points_denominator: quantity.optional(),
  })
  .strict();
export const fulfillmentTerms = z
  .object({
    operational_kind: z
      .enum(['Padova payment', 'Customer card', 'Outside seller', 'Owned value', 'Other'])
      .optional(),
    supplied: z.string().max(200).optional(),
    program_id: id.optional(),
    customer_card_owner_id: id.optional(),
    card_nickname: z.string().max(100).optional(),
    last_four: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    direct_payment: z.boolean().optional(),
    direct_amount: z.number().int().positive().optional(),
    original_quantity: z.number().int().nonnegative().optional(),
    expires_on: z.iso.date().optional(),
    description: z.string().max(2000).optional(),
    reference: z.string().max(200).optional(),
    restrictions: z.string().max(2000).optional(),
    account_holder_id: id.optional(),
    mechanism: z.string().trim().max(200).optional(),
    booked_through: z.string().trim().max(200).optional(),
    quoted_rate: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/, 'Enter an exact nonnegative decimal quote')
      .optional(),
    rate_unit: z
      .enum(['USD per point', 'USD per 1,000 points', 'cents per point', 'Fixed supplier price'])
      .optional(),
    notes: z.string().max(5000).optional(),
    portal_price: z.number().int().nonnegative().max(9_000_000_000_000).optional(),
    reference_price: z.number().int().nonnegative().max(9_000_000_000_000).optional(),
    rate_cents_numerator: quantity.optional(),
    rate_points_denominator: quantity.optional(),
    rebate_bps: z.number().int().min(0).max(10000).optional(),
    rebate_scope: z.enum(['Padova', 'Outside source']).optional(),
  })
  .strict();
export const fulfillmentSchemas = {
  confirm_travel_no_cost: z.object({
    booking_id: id,
    travel_component_id: id,
    date: z.iso.date(),
    reason: z.string().trim().min(1).max(2000),
  }),
  expected_event: z.object({
    booking_id: id.nullish(),
    kind: z.enum(['Points rebate', 'Points transfer']),
    source_asset_id: id.nullish(),
    target_asset_id: id.nullish(),
    funding_component_id: id.nullish(),
    quantity_sent: quantity.optional(),
    quantity_expected: quantity,
    due_on: z.iso.date().optional(),
    reference: z.string().max(200).default(''),
    date: z.iso.date(),
    terms: z
      .object({
        ratio_numerator: quantity.optional(),
        ratio_denominator: quantity.optional(),
        bonus_bps: z.number().int().min(0).max(100000).optional(),
        fees: z.number().int().nonnegative().max(9_000_000_000_000).default(0),
      })
      .strict()
      .default({ fees: 0 }),
  }),
  update_expected_event: z.object({
    event_id: id,
    status: z.enum(['Pending', 'Posted', 'Reversed', 'Denied']),
    date: z.iso.date(),
    reason: z.string().trim().min(1).max(2000),
    quantity_actual: quantity.optional(),
  }),
  program: z.object({
    name: text,
    category: z.enum(['Airline', 'Hotel', 'Bank', 'Portal', 'Other']),
    provider_id: id.nullish(),
  }),
  instrument: z.object({
    program_id: id,
    name: text,
    unit: unitSchema,
    role: z.enum(['Core', 'Ancillary', 'Both']),
    rules: instrumentRules.default({}),
  }),
  program_account: z.object({
    program_id: id,
    holder_id: id,
    name: text,
    masked_reference: z
      .string()
      .regex(/^.{0,4}$/)
      .default(''),
    ownership: z.enum(['Padova', 'External', 'Customer']),
  }),
  travel_component: z.object({
    booking_id: id,
    product: text,
    summary: z.string().trim().min(1).max(2000),
    provider_id: id.nullish(),
    channel: text.optional(),
    acquisition_source_id: id.nullish(),
    travel_start: z.iso.date(),
    travel_end: z.iso.date(),
    details: z
      .object({
        confirmations: z.array(text).max(50).default([]),
        provider_references: z
          .array(
            z.object({ type: z.literal('airline_pnr'), value: text, provider_id: id.nullish() }),
          )
          .max(50)
          .optional(),
        route: z.string().max(2000).optional(),
        hotel: z.string().max(200).optional(),
        restrictions: z.string().max(2000).optional(),
        traveler_ids: z.array(id).max(100).optional(),
        origin: z.string().max(200).optional(),
        destination: z.string().max(200).optional(),
        departure_local: z.string().max(40).optional(),
        arrival_local: z.string().max(40).optional(),
        marketing_carrier_id: id.optional(),
        operating_carrier_id: id.optional(),
        flight_numbers: z.array(text).max(100).optional(),
        ticket_numbers: z.array(text).max(100).optional(),
        cabin: z.string().max(200).optional(),
        hotel_address: z.string().max(2000).optional(),
        brand: z.string().max(200).optional(),
        room_type: z.string().max(200).optional(),
        benefits: z.string().max(2000).optional(),
        booking_source_confirmation: z.array(text).max(50).optional(),
        reservation_summary: z.string().max(5000).optional(),
        description: z.string().max(2000).optional(),
        summary_generated: z.boolean().optional(),
        reservation_summary_generated: z.boolean().optional(),
        pickup_location: z.string().max(2000).optional(),
        dropoff_location: z.string().max(2000).optional(),
        additional_airlines: z.string().max(2000).optional(),
        ticketing_status: z
          .enum(['Not Ticketed / Unknown', 'Ticketed', 'Voided', 'Refunded'])
          .optional(),
        end_date_known: z.boolean().optional(),
        trip_type: z.enum(['One Way', 'Round Trip', 'Multi-City']).optional(),
        segments: z.array(flightSegment).min(2).max(30).nullish(),
      })
      .default({ confirmations: [] }),
  }),
  fulfill: z.object({
    booking_id: id,
    travel_component_id: id,
    instrument_id: id.nullish(),
    program_account_id: id.nullish(),
    source_id: id.nullish(),
    mode: z.enum(['Cash/Card', 'Outside source', 'Owned inventory']),
    cash_method: z.enum(['Card', 'Cash', 'Bank']).default('Card'),
    payment_method: z.string().trim().min(1).max(200).optional(),
    role: z.enum(['Core', 'Ancillary']).default('Core'),
    unit: unitSchema,
    quantity: quantity.nullish(),
    asset_id: id.nullish(),
    cost: z.number().int().nonnegative().max(9_000_000_000_000).optional(),
    date: z.iso.date(),
    settled: z.boolean().default(false),
    source_paid: z.number().int().positive().max(9_000_000_000_000).optional(),
    account_id: id.nullish(),
    fee_amount: z.number().int().positive().max(9_000_000_000_000).optional(),
    fee_source_id: id.optional(),
    fee_settled: z.boolean().default(false),
    fee_payment_method: z.string().trim().min(1).max(200).optional(),
    fee_account_id: id.optional(),
    rebate_expected: quantity.optional(),
    terms: fulfillmentTerms.default({}),
    confirm_cost: z.boolean().default(true),
  }),
  link_fulfillment: z.object({
    booking_id: id,
    travel_component_id: id,
    funding_component_id: id,
    instrument_id: id.nullish(),
    role: z.enum(['Core', 'Ancillary']).default('Core'),
    confirm_cost: z.boolean().default(true),
    date: z.iso.date(),
    reason: z.string().trim().min(1).max(2000),
  }),
};
export async function hasFulfillmentSchema(tx: SQL) {
  const name =
    tx.storage === 'padova' ? 'padova.fulfillment_details' : 'public.fulfillment_details';
  if (!(await tx.query('SELECT to_regclass($1) AS name', [name])).rows[0]?.name) return false;
  if (tx.storage === 'padova')
    return Boolean(
      (
        await tx.query(
          "SELECT version FROM padova.app_schema_versions WHERE version='20261029_fulfillment_catalogs_units'",
        )
      ).rows.length,
    );
  return true;
}
export async function requireFulfillmentSchema(tx: SQL) {
  if (!(await hasFulfillmentSchema(tx)))
    throw new Error(
      'The incremental fulfillment extension is not installed in this workspace; no records were changed',
    );
}
export async function validateInstrument(tx: SQL, d: Row) {
  await requireFulfillmentSchema(tx);
  if (!d.instrument_id) return;
  const instrument = await one(
    tx,
    'SELECT i.*,p.active program_active FROM instruments i JOIN programs p ON p.id=i.program_id WHERE i.id=$1',
    [d.instrument_id],
  );
  if (!instrument.active || !instrument.program_active)
    throw new Error('Select an active program/instrument');
  if (d.unit && d.unit !== instrument.unit)
    throw new Error('Quantity unit must match the configured instrument');
  if (d.role && instrument.role !== 'Both' && instrument.role !== d.role)
    throw new Error('This instrument is not configured for this booking role');
  if (d.program_account_id) {
    const account = await one(tx, 'SELECT * FROM program_accounts WHERE id=$1', [
      d.program_account_id,
    ]);
    if (account.program_id !== instrument.program_id)
      throw new Error('Program account belongs to a different program');
    if (d.ownership && account.ownership !== d.ownership)
      throw new Error('Account ownership must match the asset');
    if (d.holder_id && account.holder_id !== d.holder_id)
      throw new Error('Account holder must match the asset holder');
  }
  return instrument;
}
export async function pendingTravelCosts(
  tx: SQL,
  booking_id: string,
  travel_component_id?: string,
) {
  if (!(await hasFulfillmentSchema(tx))) return 0;
  return Number(
    (
      await one(
        tx,
        `SELECT count(*) count FROM travel_components t WHERE t.booking_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND NOT COALESCE((SELECT s.complete FROM (
          SELECT f.created_at,f.id,COALESCE((f.terms->>'cost_complete')::boolean,(c.payload->>'confirm_cost')::boolean,false) complete FROM fulfillment_details f JOIN commands c ON c.id=f.command_id WHERE f.travel_component_id=t.id AND f.role='Core'
            AND NOT EXISTS(SELECT 1 FROM commands r WHERE r.kind IN ('revise_fulfillment','reverse_fulfillment') AND r.result->>'reversed_funding_id'=f.funding_component_id::text)
          UNION ALL SELECT c.created_at,c.id,true complete FROM commands c WHERE c.kind='confirm_travel_no_cost' AND c.payload->>'travel_component_id'=t.id::text
          UNION ALL SELECT c.created_at,c.id,(c.result->'terms'->>'cost_complete')::boolean complete FROM commands c JOIN fulfillment_details f ON f.id::text=c.payload->>'fulfillment_id' WHERE c.kind='revise_fulfillment' AND c.result->>'id'=f.id::text AND f.travel_component_id=t.id AND f.role='Core'
          UNION ALL SELECT c.created_at,c.id,true complete FROM commands c WHERE c.id=t.command_id AND c.kind='booking' AND c.payload->>'create_initial_travel'='true' AND c.payload->'itinerary'->>'cost_status'='No supplier cost'
        ) s ORDER BY s.created_at DESC,s.id DESC LIMIT 1),false)`,
        [booking_id, travel_component_id ?? null],
      )
    ).count,
  );
}
