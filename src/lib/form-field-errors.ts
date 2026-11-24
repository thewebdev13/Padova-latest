/** Map known server / domain error messages onto form field keys for inline display. */

export type FieldErrorMap = Record<string, string>;

const MESSAGE_FIELD_MAP: Array<{ match: RegExp | string; fields: string[]; message?: string }> = [
  {
    match: /transfer accounts must differ/i,
    fields: ['sending_asset_id', 'receiving_asset_id', 'source_asset_id', 'target_asset_id'],
    message: 'Sending and receiving accounts must be different',
  },
  {
    match: /select sending and receiving accounts|whole points sent/i,
    fields: ['source_asset_id', 'target_asset_id', 'quantity_sent'],
    message: 'Select sending and receiving accounts and whole points sent',
  },
  {
    match: /transfer requires padova-owned|transfer accounts must be padova-owned/i,
    fields: ['sending_asset_id', 'receiving_asset_id', 'source_asset_id', 'target_asset_id'],
    message: 'Both accounts must be Padova-owned points accounts',
  },
  {
    match: /both parts of the transfer ratio/i,
    fields: ['ratio_numerator', 'ratio_denominator'],
    message: 'Enter both parts of the transfer ratio',
  },
  {
    match: /expected quantity must match/i,
    fields: ['quantity_expected', 'ratio_numerator', 'ratio_denominator', 'bonus_bps'],
  },
  {
    match: /select a customer|customer is required|customer_id/i,
    fields: ['customer_id', 'party_id'],
  },
  {
    match: /booking is required|select a booking|booking_id/i,
    fields: ['booking_id'],
  },
  {
    match: /amount is required|enter an amount|invalid amount/i,
    fields: ['amount', 'quantity', 'points'],
  },
  {
    match: /payment account|account is required|select an account/i,
    fields: ['account_id', 'payment_account_id', 'asset_id'],
  },
  {
    match: /expected event|event type/i,
    fields: ['kind'],
  },
  {
    match: /whole points expected|points expected/i,
    fields: ['points'],
  },
  {
    match: /date is required|enter a date|invalid date/i,
    fields: ['date', 'occurred_on', 'expected_on', 'travel_start', 'travel_end'],
  },
  {
    match: /description is required|enter a description/i,
    fields: ['description', 'note', 'notes'],
  },
  {
    match: /instrument|program account/i,
    fields: ['instrument_id', 'program_account_id'],
  },
  {
    match: /permission|not allowed|forbidden/i,
    fields: [],
  },
  {
    match: /booking traveler cancellation or a travel-component cancellation/i,
    fields: ['travel_component_id', 'traveler_id'],
    message:
      'Choose either one flight/stay OR one traveler, not both. Clear one field to continue.',
  },
  {
    match: /not eligible as seller/i,
    fields: [
      'party_id',
      'seller_id',
      'supplier_id',
      'change_seller_id',
      'source_id',
      'acquisition_source_id',
    ],
    message:
      'Choose a Purchased From / seller party. Referral partners are paid under Commission Payable, not as a seller payment.',
  },
  {
    match: /choose the actual supplier\/payee|acquisition source; an indirect channel/i,
    fields: ['seller_id', 'acquisition_source_id', 'source_id'],
    message: 'Choose who Padova owes (Purchased From / payee). An indirect channel alone is not enough.',
  },
  {
    match: /enter the actual cost padova paid/i,
    fields: ['cost', 'face_amount'],
    message: 'Enter the actual cost Padova paid.',
  },
  {
    match: /not eligible as (customer|traveler|airline|property|rental|commission_payer)/i,
    fields: ['party_id', 'customer_id', 'provider_id', 'traveler_ids', 'airline_id', 'supplier_id'],
  },
  {
    match: /choose the original funding component|funding component belongs|link the original funding/i,
    fields: ['funding_component_id'],
  },
  {
    match: /customer refund cannot exceed|customer refund due cannot exceed/i,
    fields: ['customer_due', 'charge_reduction'],
  },
  {
    match: /cancellation credit exceeds/i,
    fields: ['charge_reduction'],
  },
  {
    match: /refund exceeds original funding/i,
    fields: ['supplier_expected', 'funding_component_id'],
  },
];

/** Cancel form: travel-component vs traveler are mutually exclusive. */
export function cancelScopeFieldErrors(vals: {
  travel_component_id?: unknown;
  traveler_id?: unknown;
}): FieldErrorMap {
  const travel = !isEmptyFieldValue(vals.travel_component_id);
  const traveler = !isEmptyFieldValue(vals.traveler_id);
  if (!travel || !traveler) return {};
  const msg =
    'Choose either one flight/stay OR one traveler, not both. Clear one field to continue.';
  return { travel_component_id: msg, traveler_id: msg };
}

export function mapErrorMessageToFields(
  message: string,
  knownKeys: string[],
): { fieldErrors: FieldErrorMap; leftover: string } {
  const msg = String(message || '').trim();
  if (!msg) return { fieldErrors: {}, leftover: '' };

  const known = new Set(knownKeys);
  for (const rule of MESSAGE_FIELD_MAP) {
    const hit =
      typeof rule.match === 'string'
        ? msg.toLowerCase().includes(rule.match.toLowerCase())
        : rule.match.test(msg);
    if (!hit) continue;
    const fields = rule.fields.filter((k) => known.has(k));
    if (!fields.length) {
      // Matched a known domain error but no matching visible field — keep banner.
      return { fieldErrors: {}, leftover: msg };
    }
    const text = rule.message ?? msg;
    const fieldErrors: FieldErrorMap = {};
    for (const key of fields) fieldErrors[key] = text;
    return { fieldErrors, leftover: '' };
  }

  // Heuristic: "... field_name ..." when key appears in message
  const fieldErrors: FieldErrorMap = {};
  for (const key of knownKeys) {
    const label = key.replace(/_/g, ' ');
    if (new RegExp(`\\b${key}\\b`, 'i').test(msg) || new RegExp(label, 'i').test(msg)) {
      fieldErrors[key] = msg;
    }
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, leftover: '' };
  return { fieldErrors: {}, leftover: msg };
}

export function requiredFieldMessage(label: string): string {
  return `${label} is required`;
}

export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}
