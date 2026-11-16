import { redactOperationalText } from './operational-redaction';
export function csvCell(value: unknown) {
  const raw = redactOperationalText(String(value ?? ''));
  const safe = /^[\s\uFEFF]*[=+@-]/.test(raw) && !/^-\d+(?:\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
