/** Unknown optional dates must remain readable without breaking the entire screen. */
export function dateLabel(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  if (!value) return 'Not set';
  const date = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-US', options);
}

/**
 * Plan one date style for activity / audit timestamps (date + time).
 * Blank → Not set; unparseable → Unknown date — never invent "now".
 */
export function dateTimeLabel(value?: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
