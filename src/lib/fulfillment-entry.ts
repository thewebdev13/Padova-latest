import { decimalUnits } from './entry-options';

// Serialize the whole retained draft, including collapsed optional fields.
// Visibility controls disclosure, not whether a prior saved term is erased.
export function fulfillmentEntryTerms(values: Record<string, any>) {
  const terms: Record<string, any> = {};
  for (const key of [
    'operational_kind',
    'supplied',
    'program_id',
    'customer_card_owner_id',
    'card_nickname',
    'last_four',
    'direct_payment',
    'direct_amount',
    'original_quantity',
    'expires_on',
    'description',
    'account_holder_id',
    'mechanism',
    'booked_through',
    'quoted_rate',
    'rate_unit',
    'notes',
    'reference',
    'portal_price',
    'reference_price',
    'rate_cents_numerator',
    'rate_points_denominator',
    'restrictions',
  ]) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    terms[key] = ['direct_amount', 'original_quantity'].includes(key)
      ? Number(value)
      : key === 'direct_payment'
        ? !!value
        : ['portal_price', 'reference_price', 'rate_cents_numerator'].includes(key)
          ? decimalUnits(value)
          : key === 'rate_points_denominator'
            ? decimalUnits(value, true)
            : String(value);
  }
  return terms;
}
