import { sourceFingerprint } from '../../src/lib/historical-delta';
import { comparableSourceCells } from '../../src/lib/source-cell-comparison';
export type R = Record<string, any>;
export const locatorKey = (r: R) => JSON.stringify([r.workbook_id, r.tab, r.row]);
export const normalizedName = (s: string) =>
  s.normalize('NFKC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export function exactCents(value: unknown): number | null {
  if (typeof value === 'number') {
    const n = value * 100,
      rounded = Math.round(n);
    return Number.isSafeInteger(rounded) && Math.abs(n - rounded) < 0.000001 ? rounded : null;
  }
  if (typeof value !== 'string') return null;
  const displayed = value.trim().replace(/^\$/, '');
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(displayed)) return null;
  const clean = displayed.replaceAll(',', '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  const negative = clean.startsWith('-'),
    [whole, fraction = ''] = clean.replace(/^-/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents * (negative ? -1 : 1) : null;
}
export function sourceDelta(before: R[], after: R[]) {
  const old = new Map(before.map((r) => [locatorKey(r), r]));
  if (old.size !== before.length || new Set(after.map(locatorKey)).size !== after.length)
    throw new Error('Duplicate source locator');
  const changed: R[] = [],
    added: R[] = [];
  for (const r of after) {
    const p = old.get(locatorKey(r));
    if (!p) {
      added.push(r);
      continue;
    }
    const a = comparableSourceCells(p.raw_payload.values ?? []),
      b = comparableSourceCells(r.raw_payload.values ?? []);
    if (sourceFingerprint(a) !== sourceFingerprint(b))
      changed.push({
        key: locatorKey(r),
        tab: r.tab,
        row: r.row,
        workbook_id: r.workbook_id,
        before: p,
        after: r,
        columns: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).filter(
          (i) => sourceFingerprint(a[i] ?? {}) !== sourceFingerprint(b[i] ?? {}),
        ),
      });
  }
  const keys = new Set(after.map(locatorKey));
  return { added, changed, missing: before.filter((r) => !keys.has(locatorKey(r))) };
}
export function scalar(c: R | undefined) {
  return (
    c?.effectiveValue?.stringValue ??
    c?.effectiveValue?.numberValue ??
    c?.userEnteredValue?.stringValue ??
    c?.userEnteredValue?.numberValue ??
    c?.formattedValue ??
    null
  );
}
export function cell(row: R, column: string): R | undefined {
  return Object.entries(row.original_fields ?? {}).find(
    ([k]) => k.split(' — ')[0] === column,
  )?.[1] as R | undefined;
}
export const value = (r: R, c: string) => scalar(cell(r, c));
export function roster(raw: string): {
  names: string[];
  unresolved: string[];
  classification: string;
} {
  let s = raw.trim().replace(/^"|"$/g, '');
  if (/^(?:pax|name of passengers)$/i.test(s))
    return { names: [], unresolved: [], classification: 'Header' };
  if (
    /^(?:.+\bfam(?:ily)?\s*$|hotel\b|check\b|bag\b)/i.test(s) ||
    /^[A-Z]{3}-[A-Z]{3}(?:\s|$)/.test(s) ||
    !/[a-z]/i.test(s) ||
    /^\d[\d,.\s]+(?:CSR|sa\$)/i.test(s)
  )
    return {
      names: [],
      unresolved: [],
      classification: /fam$/i.test(s)
        ? 'Group label, no identity inferred'
        : 'Non-person supporting text',
    };
  const names: string[] = [],
    unresolved: string[] = [];
  const clean = (v: string) =>
    v
      .replace(/\b(?:lap infant|infant in seat|child|infant|Mr|Mrs)\b/gi, '')
      .replace(/\(\s*\)/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  const full = (v: string) =>
    /^[\p{L}][\p{L}' .-]+$/u.test(v) && v.split(/\s+/).length >= 2 && v.split(/\s+/).length <= 7;
  for (const line of s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const sabre = [
      ...line.matchAll(/(?:\d[.I/\d]*)([A-Z][A-Z'-]+)\/([A-Z ]+)\*\d{2}[A-Z]{3}\d{2}/g),
    ];
    if (sabre.length) {
      for (const m of sabre) names.push(clean(`${m[2]} ${m[1]}`));
      continue;
    }
    const pairs = [...line.matchAll(/(?:^|,\s*)([A-Z][A-Z' -]+),\s*([^,]+)/g)];
    const covered = pairs.length
      ? line.replace(/(?:^|,\s*)([A-Z][A-Z' -]+),\s*([^,]+)/g, '').replace(/[\s,]/g, '')
      : line;
    if (pairs.length && !covered) {
      for (const m of pairs) {
        for (const given of m[2].split(/\s*\/\s*/)) {
          const n = clean(`${given} ${m[1]}`);
          full(n) ? names.push(n) : unresolved.push(given);
        }
      }
      continue;
    }
    const slash = [...line.matchAll(/^([A-Z][A-Z'-]+)\/([A-Z][A-Z ]+)$/g)];
    if (slash.length) {
      names.push(clean(`${slash[0][2]} ${slash[0][1]}`));
      continue;
    }
    for (const p of line.split(/\s*,\s*|\s*;\s*/)) {
      const n = clean(p);
      full(n) ? names.push(n) : unresolved.push(p);
    }
  }
  return {
    names: [...new Map(names.map((n) => [normalizedName(n), n])).values()],
    unresolved,
    classification: unresolved.length
      ? 'Partial roster'
      : 'Explicit roster notation; labels only, no identity merge',
  };
}
