/** Unknown optional dates must remain readable without breaking the entire screen. */
export function dateLabel(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  if (!value) return 'Not set';
  const date = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-US', options);
}
