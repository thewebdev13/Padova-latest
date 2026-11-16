/** Display preserved cell values, never convert claims into posted financial amounts. */
export function historicalSourceValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw !== 'object') return String(raw);
  const cell = raw as Record<string, any>;
  const value =
    cell.formattedValue ??
    cell.effectiveValue?.stringValue ??
    cell.effectiveValue?.numberValue ??
    cell.effectiveValue?.boolValue ??
    cell.userEnteredValue?.stringValue ??
    cell.userEnteredValue?.numberValue;
  return value == null ? '' : String(value);
}
