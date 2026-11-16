/** Restrict operational copies; preserved source evidence is never mutated. */
export function redactOperationalText(text: string): string {
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text)) return text;
  return text.replace(/\b(?:\d[ .-]?){12,18}\d\b/g, (candidate, offset: number) => {
    const digits = candidate.replace(/\D/g, '');
    if (!/^[1-6]/.test(digits)) return candidate;
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
      let d = Number(digits[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    const cardLabel = /(?:card|pan|amex|visa|mastercard)\s*[:#-]?\s*$/i.test(
      text.slice(Math.max(0, offset - 30), offset),
    );
    return sum % 10 === 0 || (digits.length >= 15 && cardLabel)
      ? '[REDACTED payment number]'
      : candidate;
  });
}
export function redactOperationalValue<T>(value: T): T {
  if (typeof value === 'string') return redactOperationalText(value) as T;
  if (Array.isArray(value)) return value.map(redactOperationalValue) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        typedTicketValue(value, k, v) ? v : redactOperationalValue(v),
      ]),
    ) as T;
  return value;
}
function typedTicketValue(parent: object, key: string, value: unknown) {
  const record = parent as Record<string, unknown>;
  if (
    ['phone', 'whatsapp'].includes(key) &&
    typeof value === 'string' &&
    /^\+?[\d () .-]+$/.test(value) &&
    value.replace(/\D/g, '').length <= 15
  )
    return true;
  const ticket = (v: unknown) => typeof v === 'string' && /^\d{13}$/.test(v);
  return (
    (key === 'value' &&
      (record.type === 'ticket_number' || record.reference_type === 'ticket_number') &&
      ticket(value)) ||
    (key === 'ticket_numbers' && (Array.isArray(value) ? value.every(ticket) : ticket(value)))
  );
}
/** Preserve restricted provenance exactly; sanitize only operational representations. */
export function sanitizeOperationalInput<T>(value: T): T {
  if (typeof value === 'string') return redactOperationalText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeOperationalInput) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        [
          'historical_sources',
          'source_provenance',
          'raw',
          'raw_cell',
          'raw_text',
          'original_fields',
          'source_locator',
        ].includes(k) || typedTicketValue(value, k, v)
          ? v
          : sanitizeOperationalInput(v),
      ]),
    ) as T;
  return value;
}
