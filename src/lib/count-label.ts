/**
 * Plan wording: "1 booking" / "1 credit" — never "1 bookings" or "credit(s)".
 * Unknown/non-finite counts stay as-is for the caller to label Incomplete.
 */

/** Singular or plural noun for a known count. */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return Number(count) === 1 ? singular : plural;
}

/** Full "N noun" label for a known count. */
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  const n = Number(count);
  return `${n} ${pluralize(n, singular, plural)}`;
}

/**
 * When the UI already has a plural label ("bookings"), show the singular for 1.
 * Multi-word labels stay unchanged (e.g. "activity rows").
 */
export function pluralLabelFromPlural(total: number, pluralLabel: string): string {
  if (total === 1 && pluralLabel.endsWith('s') && !pluralLabel.includes(' ')) {
    return pluralLabel.replace(/s$/, '');
  }
  return pluralLabel;
}
