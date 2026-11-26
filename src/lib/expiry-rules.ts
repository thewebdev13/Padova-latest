/**
 * Plan Points: program names, accounts, and expiry rules are lists the owner can add.
 * Rules are labels only — never invent dollars. Exact expiry stays on expires_on.
 */

export const EXPIRY_RULES = [
  'Exact date on file',
  '12 months from purchase',
  '18 months from purchase',
  '24 months from purchase',
  'Calendar year-end',
  'Never expires',
] as const;

export type ExpiryRule = (typeof EXPIRY_RULES)[number] | string;

export const EXPIRY_RULE_OTHER = 'Other…';

const RULE_PREFIX = 'Expiry rule:';

/**
 * Merge built-in expiry rules with owner-used rules (from asset restrictions).
 * Always ends with Other… Never invents money or dates from the label alone.
 */
export function mergeExpiryRuleOptions(
  extras: Array<string | null | undefined> = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const s = String(raw || '').trim();
    if (!s || s === EXPIRY_RULE_OTHER || s === 'Other') return;
    const key = s.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const r of EXPIRY_RULES) add(r);
  for (const e of extras) add(e);
  out.push(EXPIRY_RULE_OTHER);
  return out;
}

export function resolveExpiryRule(
  rule: string | null | undefined,
  ruleCustom?: string | null,
): string {
  const selected = String(rule || '').trim();
  if (selected === EXPIRY_RULE_OTHER || selected === 'Other') {
    const custom = String(ruleCustom || '').trim();
    return custom ? custom.slice(0, 80) : '';
  }
  return selected;
}

/** Pull owner-recorded rule label from asset restrictions (blank → null). */
export function parseExpiryRuleFromRestrictions(
  restrictions: string | null | undefined,
): string | null {
  const text = String(restrictions || '');
  const m = text.match(/(?:^|\n)\s*Expiry rule:\s*(.+?)\s*(?:\n|$)/i);
  if (!m) return null;
  const rule = m[1].trim();
  return rule || null;
}

/** Encode rule into restrictions without duplicating; blank rule leaves text unchanged. */
export function encodeExpiryRuleInRestrictions(
  rule: string | null | undefined,
  existing: string | null | undefined = '',
): string {
  const label = String(rule || '').trim();
  const base = String(existing || '')
    .replace(/(?:^|\n)\s*Expiry rule:\s*.+?(?=\n|$)/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (!label) return base;
  const line = `${RULE_PREFIX} ${label.slice(0, 80)}`;
  return base ? `${line}\n${base}` : line;
}

/**
 * Suggest expires_on from a known rule + purchase date.
 * Returns null when Unknown / Never / Exact date / unparseable — never invents.
 */
export function suggestExpiresOn(
  rule: string | null | undefined,
  purchaseDate: string | null | undefined,
): string | null {
  const r = String(rule || '').trim().toLocaleLowerCase();
  const d = String(purchaseDate || '').trim().slice(0, 10);
  if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (r === 'never expires' || r === 'exact date on file') return null;

  const months = r.match(/^(\d+)\s*months?\s+from\s+purchase$/);
  if (months) {
    const n = Number(months[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 120) return null;
    return addCalendarMonths(d, n);
  }
  if (r === 'calendar year-end') {
    const year = Number(d.slice(0, 4));
    if (!Number.isFinite(year)) return null;
    return `${year}-12-31`;
  }
  return null;
}

function addCalendarMonths(isoDate: string, months: number): string | null {
  const [y, m, day] = isoDate.split('-').map(Number);
  if (![y, m, day].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(Date.UTC(y, m - 1 + months, day));
  // Clamp overflow (e.g. Jan 31 + 1 month → last day of Feb).
  if (dt.getUTCDate() !== day) {
    dt.setUTCDate(0);
  }
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
