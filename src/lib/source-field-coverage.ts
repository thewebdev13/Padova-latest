export const populated = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(populated);
  if (typeof value === 'object') return Object.values(value).some(populated);
  return true; // Zero, false, formulas and verbatim text all carry information.
};
export function populatedPaths(value: unknown, prefix = '', result = new Set<string>()) {
  if (!populated(value)) return result;
  if (Array.isArray(value)) for (const item of value) populatedPaths(item, `${prefix}[]`, result);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      populatedPaths(item, prefix ? `${prefix}.${key}` : key, result);
  else result.add(prefix);
  return result;
}
export function classifySourceField(header: string) {
  const key = header.trim().toLowerCase().replace(/\s+/g, ' ');
  const structured: Record<string, string> = {
    customer: 'parties / preserved original customer label',
    client: 'parties / preserved original customer label',
    pax: 'traveler matching (unsplit original label retained)',
    'name of passengers': 'traveler matching (unsplit original label retained)',
    route: 'booking itinerary / original route',
    'route/stay': 'booking itinerary / original route',
    'date booked': 'bookings.booked_on candidate',
    'date of booking': 'bookings.booked_on candidate',
    'date of travel': 'booking itinerary / travel date candidate',
    'airline confirmation': 'confirmations candidate',
    'airline refrence': 'confirmations candidate',
    'reservation code': 'confirmations candidate',
    sabre: 'confirmations / GDS reference candidate',
    'cap1 confirmation': 'Capital One case reference',
    'cap1 reference': 'Capital One case reference',
  };
  if (structured[key])
    return {
      category: 'A',
      status: 'candidate mapping + preserved raw',
      destination: structured[key],
      reason: 'Requires accepted identity/source mapping before operational creation.',
    };
  const financial: Record<string, string> = {
    'sale price': 'charges / agreed customer sale candidate',
    'price given to client': 'charges / agreed customer sale candidate',
    cost: 'funding/cost evidence; blank is unknown',
    'new rate': 'price-match final confirmed rate candidate',
    'original rate': 'price-match original rate',
    'online price': 'reference/quote price, not agreed sale',
  };
  if (financial[key])
    return {
      category: 'B',
      status: 'candidate mapping + preserved raw',
      destination: financial[key],
      reason: 'A field candidate is not verification or authorization to post money.',
    };
  if (
    /paid|payed|charged|refund|credit|voucher|commission|denied|compensation|received|recieved|amount|balance|fop/i.test(
      key,
    )
  )
    return {
      category: 'D',
      status: 'Needs Review + preserved raw',
      destination: 'Historical Source Details / linked financial evidence',
      reason:
        'Payment/funding/credit/refund wording or formulas do not prove actual money movement or ownership.',
    };
  return {
    category: 'C',
    status: 'preserved raw',
    destination: 'Historical Source Details / complete source payload',
    reason:
      'No confident structured destination yet; original values, notes and metadata remain recoverable.',
  };
}
