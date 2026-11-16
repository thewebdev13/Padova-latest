import { z } from 'zod';

// Stored in the existing versioned itinerary JSON, in both storage adapters.
// Preserve unrelated legacy keys when editing; never turn metadata into postings.
const optionalText = z.string().trim().max(2000).optional();
export const bookingItinerary = z
  .object({
    historical_sources: z
      .array(
        z
          .object({
            workbook_id: z.string().optional(),
            workbook_title: z.string().optional(),
            source_system: z.string().optional(),
            tab: z.string().optional(),
            row: z.number().int().positive().optional(),
            original_fields: z.record(z.string(), z.unknown()),
            evidence_ids: z.array(z.string().uuid()).optional(),
            batch_id: z.string().optional(),
            snapshot_id: z.string().optional(),
          })
          .catchall(z.unknown()),
      )
      .max(1000)
      .optional(),
    price_match_history: z
      .array(
        z.object({
          id: z.string().uuid(),
          status: z.enum([
            'Attempted',
            'Pending',
            'Approved',
            'Denied',
            'Verified available',
            'Received',
            'Cancelled',
          ]),
          request_id: z.string().uuid().optional(),
          profile_id: z.string().uuid().optional(),
          requested_amount: z.number().int().nonnegative().optional(),
          expected_credit: z.number().int().nonnegative().optional(),
          approved_amount: z.number().int().nonnegative().optional(),
          received_amount: z.number().int().nonnegative().optional(),
          received_on: z.iso.date().optional(),
          date: z.iso.date(),
          original_rate: z.number().int().nonnegative().optional(),
          original_rate_reason: z.string().optional(),
          final_rate: z.number().int().nonnegative().optional(),
          amount: z.number().int().nonnegative().optional(),
          reference: z.string().optional(),
          reason: z.string().optional(),
          asset_id: z.string().uuid().optional(),
          actor: z.string(),
          recorded_at: z.string(),
        }),
      )
      .max(1000)
      .optional(),
    cost_status: z.enum(['Pending', 'Confirmed', 'No supplier cost']).optional(),
    origin: optionalText,
    route: optionalText,
    trip_type: z.enum(['One Way', 'Round Trip', 'Multi-City']).optional(),
    destination: optionalText,
    airline_id: z.string().uuid().optional(),
    acquisition_source_id: z.string().uuid().optional(),
    acquisition_source_status: z.enum(['Identified', 'Unknown', 'Not applicable']).optional(),
    flight_numbers: z.array(z.string().trim().min(1).max(100)).optional(),
    ticket_numbers: z.array(z.string().trim().min(1).max(100)).optional(),
    hotel_name: optionalText,
    hotel_address: optionalText,
    room_type: optionalText,
  })
  .catchall(z.unknown());

export const itineraryEntryKeys = [
  'route',
  'trip_type',
  'origin',
  'destination',
  'airline_id',
  'acquisition_source_id',
  'acquisition_source_status',
  'flight_numbers',
  'ticket_numbers',
  'hotel_name',
  'hotel_address',
  'room_type',
] as const;
