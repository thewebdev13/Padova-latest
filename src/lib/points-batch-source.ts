/**
 * Plan Points batch field: source (purchase, transfer with bonus, sold on).
 * Label only — never invents cost or quantity.
 */

export const POINTS_BATCH_SOURCES = [
  'purchase',
  'transfer with bonus',
  'sold on',
] as const;

export type PointsBatchSource = (typeof POINTS_BATCH_SOURCES)[number];

const SOURCE_PREFIX = 'Points source:';

export function isPointsBatchSource(raw: string | null | undefined): raw is PointsBatchSource {
  const s = String(raw || '').trim().toLocaleLowerCase();
  return (POINTS_BATCH_SOURCES as readonly string[]).includes(s);
}

export function normalizePointsBatchSource(
  raw: string | null | undefined,
): PointsBatchSource | null {
  const s = String(raw || '').trim().toLocaleLowerCase();
  if (!s) return null;
  const hit = POINTS_BATCH_SOURCES.find((x) => x === s);
  return hit ?? null;
}

export function pointsBatchSourceLabel(raw: string | null | undefined): string | null {
  const n = normalizePointsBatchSource(raw);
  if (!n) return null;
  if (n === 'purchase') return 'Purchase';
  if (n === 'transfer with bonus') return 'Transfer with bonus';
  return 'Sold on';
}

export function parsePointsBatchSourceFromRestrictions(
  restrictions: string | null | undefined,
): PointsBatchSource | null {
  const text = String(restrictions || '');
  const m = text.match(/(?:^|\n)\s*Points source:\s*(.+?)\s*(?:\n|$)/i);
  if (!m) return null;
  return normalizePointsBatchSource(m[1]);
}

export function encodePointsBatchSourceInRestrictions(
  source: string | null | undefined,
  existing: string | null | undefined = '',
): string {
  const normalized = normalizePointsBatchSource(source);
  const base = String(existing || '')
    .replace(/(?:^|\n)\s*Points source:\s*.+?(?=\n|$)/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (!normalized) return base;
  const line = `${SOURCE_PREFIX} ${normalized}`;
  return base ? `${line}\n${base}` : line;
}
