import type { Database, SQL } from './db';
import { execute } from './finance';
import type { Actor } from './permissions';
import { eligibleParty, type DirectoryRole, providerRole } from './directory-eligibility';
import {
  aiAutoLiveEnabled,
  aiDisclaimerLine,
  aiIntakeEnabled,
  aiProvider,
} from './claude-intake';
import { businessDate } from './business-date';

type R = Record<string, unknown>;

function isUnknownLabel(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).normalize('NFKC').trim();
  return !s || /^(unknown|n\/a|not applicable)$/i.test(s);
}

function isoDateOrEmpty(value: unknown): string {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Paste money is USD decimals / cents-as-number — never invent. */
function parseUsdToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return undefined;
    // Integers from form are already cents when > typical dollar display; intake paste uses dollars.
    if (Number.isInteger(value) && value >= 1000) return value;
    return Math.round(value * 100);
  }
  const raw = String(value ?? '')
    .trim()
    .replace(/^\$/, '')
    .replace(/,/g, '');
  if (!raw || /^(unknown|n\/a|not applicable)$/i.test(raw)) return undefined;
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return undefined;
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return undefined;
  return cents;
}

async function findExactParty(
  db: SQL,
  name: string,
  role: DirectoryRole,
): Promise<{ id: string } | 'ambiguous' | null> {
  const rows = (
    await db.query(
      `SELECT * FROM parties
       WHERE archived_at IS NULL
         AND lower(trim(name)) = lower(trim($1))`,
      [name],
    )
  ).rows;
  const eligible = rows.filter((p) => eligibleParty(p, role));
  if (eligible.length === 1) return { id: String(eligible[0].id) };
  if (eligible.length > 1) return 'ambiguous';
  return null;
}

async function resolveOrCreateParty(
  db: Database,
  actor: Actor,
  name: string,
  role: DirectoryRole,
  extra?: R,
): Promise<{ id: string } | { blocked: string }> {
  const found = await findExactParty(db, name, role);
  if (found === 'ambiguous') {
    return {
      blocked: `Multiple ${role} records named “${name}” — choose in the app before live save.`,
    };
  }
  if (found) return found;
  const created = await execute(db, actor, {
    id: crypto.randomUUID(),
    kind: 'party',
    data: {
      name: name.trim(),
      kind: ['airline', 'property', 'rental', 'seller', 'commission_payer'].includes(role)
        ? 'company'
        : 'person',
      roles: [role],
      ...(extra || {}),
      details: {
        ...(typeof extra?.details === 'object' && extra.details ? (extra.details as R) : {}),
        origin: 'ai-intake',
        ai_created: true,
      },
    },
  });
  return { id: String(created.id) };
}

export type PromoteResult =
  | {
      live: false;
      reason: string;
      draft_id: string;
      summary?: string;
    }
  | {
      live: true;
      draft_id: string;
      booking_id: string;
      booking_code?: string;
      summary: string;
      sale_known: boolean;
      needs_review: true;
    };

/**
 * Owner 1B + 2A: after draft save, optionally create a live booking.
 * Never invents money. Ambiguous parties / missing product or dates → draft only.
 */
export async function maybePromoteIntakeToLiveBooking(
  db: Database,
  actor: Actor,
  input: {
    draft_id: string;
    title: string;
    entry: R;
    issues?: string[];
  },
): Promise<PromoteResult> {
  const draft_id = input.draft_id;
  if (!aiIntakeEnabled() || !aiAutoLiveEnabled()) {
    return { live: false, reason: 'auto_live_disabled', draft_id };
  }

  const entry = input.entry || {};
  const product = String(entry.product || '').trim();
  if (!['Flight', 'Hotel', 'Car', 'Other'].includes(product)) {
    return {
      live: false,
      reason: 'product_unknown',
      draft_id,
      summary: 'Draft saved. Product still Unknown — open draft to finish live booking.',
    };
  }

  const travel_start = isoDateOrEmpty(entry.travel_start);
  if (!travel_start) {
    return {
      live: false,
      reason: 'travel_dates_unknown',
      draft_id,
      summary:
        'Draft saved with AI fields. Travel dates still Unknown — open draft to set dates then Save Booking.',
    };
  }
  let travel_end = isoDateOrEmpty(entry.travel_end) || travel_start;
  const trip_type =
    product === 'Flight'
      ? String(entry.trip_type || '').trim() ||
        (travel_end !== travel_start ? 'Round Trip' : 'One Way')
      : undefined;
  if (product === 'Flight' && trip_type === 'One Way') travel_end = travel_start;

  const hints = (entry.intake_party_hints || {}) as R;
  const customerLabel = !isUnknownLabel(entry.intake_customer_label)
    ? String(entry.intake_customer_label)
    : !isUnknownLabel(hints.customer)
      ? String(hints.customer)
      : '';
  const travelerLabel = !isUnknownLabel(entry.intake_traveler_label)
    ? String(entry.intake_traveler_label)
    : !isUnknownLabel(hints.traveler)
      ? String(hints.traveler)
      : !isUnknownLabel(entry.pending_traveler)
        ? String(entry.pending_traveler)
        : '';

  // Explicit Unknown customer identity when name missing (never invent a real person).
  const customerName = customerLabel || 'Unknown';
  const customer = await resolveOrCreateParty(db, actor, customerName, 'customer', {
    ...(entry.intake_customer_phone ? { phone: String(entry.intake_customer_phone) } : {}),
    ...(entry.intake_customer_email ? { email: String(entry.intake_customer_email) } : {}),
  });
  if ('blocked' in customer) {
    return { live: false, reason: customer.blocked, draft_id };
  }

  const new_travelers: string[] = [];
  const traveler_ids: string[] = [];
  if (travelerLabel) {
    const names = travelerLabel
      .split(/,|;|\band\b/i)
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      if (isUnknownLabel(name)) continue;
      const t = await resolveOrCreateParty(db, actor, name, 'traveler');
      if ('blocked' in t) {
        new_travelers.push(name);
      } else {
        traveler_ids.push(t.id);
      }
    }
  }

  let provider_id: string | null = null;
  const providerLabel = String(entry.intake_provider_label || hints.airline || hints.property || '').trim();
  if (providerLabel && !isUnknownLabel(providerLabel) && product !== 'Other') {
    const role = providerRole(product);
    const p = await resolveOrCreateParty(db, actor, providerLabel, role);
    if (!('blocked' in p)) provider_id = p.id;
  }

  const saleCents = parseUsdToCents(entry.sale);
  const sale_known = saleCents !== undefined;

  const booked_on = await businessDate(db);
  const primaryRef = String(entry.primary_reference || '').trim();
  const summary =
    String(entry.reservation_summary || '').trim() ||
    [product, entry.route, primaryRef, input.title].filter(Boolean).join(' · ').slice(0, 500) ||
    'AI intake booking';

  const notes = [
    String(entry.notes || '').trim(),
    aiDisclaimerLine(aiProvider()),
    sale_known ? '' : 'Customer price: Unknown (Needs Review).',
    customerName === 'Unknown' ? 'Customer identity: Unknown (Needs Review).' : '',
    (input.issues || []).length
      ? `Intake issues:\n- ${(input.issues || []).slice(0, 12).join('\n- ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const refType =
    product === 'Hotel'
      ? ('hotel_confirmation' as const)
      : product === 'Car'
        ? ('car_confirmation' as const)
        : product === 'Flight'
          ? ('airline_pnr' as const)
          : ('other_reference' as const);
  const refs = primaryRef ? [{ type: refType, value: primaryRef }] : [];

  try {
    const booking = await execute(db, actor, {
      id: crypto.randomUUID(),
      kind: 'booking',
      data: {
        customer_id: customer.id,
        product,
        channel: 'Unknown',
        summary,
        booked_on,
        travel_start,
        travel_end,
        traveler_ids,
        confirmations: primaryRef ? [primaryRef] : [],
        sale: sale_known ? saleCents : 0,
        travel_components_input: [
          {
            product,
            summary,
            provider_id,
            channel: 'Unknown',
            travel_start,
            travel_end,
            details: {
              end_date_known: travel_end !== travel_start || product !== 'Flight',
              confirmations: primaryRef ? [primaryRef] : [],
              route: entry.route ? String(entry.route) : undefined,
              reservation_summary: summary,
              summary_generated: true,
              reservation_summary_generated: !entry.summary_override,
              flight_numbers: entry.flight_numbers
                ? String(entry.flight_numbers)
                    .split(/[,;\s]+/)
                    .filter(Boolean)
                : undefined,
              ticket_numbers: entry.ticket_numbers
                ? String(entry.ticket_numbers)
                    .split(/[,;\s]+/)
                    .filter(Boolean)
                : undefined,
              cabin: entry.cabin ? String(entry.cabin) : undefined,
              room_type: entry.room_type ? String(entry.room_type) : undefined,
              traveler_ids,
              ...(product === 'Other' && entry.description
                ? { description: String(entry.description) }
                : {}),
              ...(product === 'Hotel' && entry.location
                ? { hotel_address: String(entry.location) }
                : {}),
            },
          },
        ],
        itinerary: {
          cost_status: 'Pending',
          sale_known,
          ...(product === 'Hotel' && providerLabel ? { hotel_name: providerLabel } : {}),
        },
        operational: {
          version: 1,
          trip_type: product === 'Flight' ? (trip_type as 'One Way' | 'Round Trip' | 'Multi-City') : undefined,
          draft_id,
          new_travelers,
          references: refs,
          notes,
          sale_known,
          components: [],
          additional_charge: 0,
          other_description: product === 'Other' ? String(entry.description || summary) : undefined,
        },
      },
    });

    const code = String((booking as R).code || '');
    return {
      live: true,
      draft_id,
      booking_id: String(booking.id),
      booking_code: code || undefined,
      sale_known,
      needs_review: true,
      summary: [
        `AI created live booking${code ? ` ${code}` : ''}: ${summary}`,
        sale_known ? '' : 'Customer price Unknown — Needs Review.',
        customerName === 'Unknown' ? 'Customer Unknown — Needs Review.' : '',
        aiDisclaimerLine(aiProvider()),
      ]
        .filter(Boolean)
        .join(' '),
    };
  } catch (e) {
    return {
      live: false,
      draft_id,
      reason: e instanceof Error ? e.message : 'live_booking_failed',
      summary:
        'Draft saved. Live booking not created automatically — open the draft and Save Booking after review.',
    };
  }
}
