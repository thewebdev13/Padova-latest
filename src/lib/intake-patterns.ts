import { createHash } from 'node:crypto';
import type { SQL } from './db';
import { parseQuickPaste } from './quick-paste';

export type IntakeExtractRule = {
  label: string;
  /** Case-insensitive source regex with one capture group for the value. */
  regex: string;
};

export type IntakePatternHit = {
  fingerprint: string;
  paste: string;
  field_labels: string[];
  pattern_id?: string;
};

const MEMORY_CAP = 80;
const DB_CAP = 200;
const MIN_FIELDS_TO_LEARN = 5;
const MIN_FIELDS_TO_APPLY = 5;

/** Warm-instance memory (Vercel/local). Never required for correctness. */
const memoryPatterns = new Map<
  string,
  {
    id?: string;
    field_labels: string[];
    extract_rules: IntakeExtractRule[];
    sample_paste: string;
    hit_count: number;
    disabled: boolean;
  }
>();

const PROVIDER_HINTS = [
  'delta',
  'united',
  'american airlines',
  'el al',
  'british airways',
  'lufthansa',
  'emirates',
  'etihad',
  'qatar',
  'booking.com',
  'expedia',
  'hotels.com',
  'marriott',
  'hilton',
  'hyatt',
  'airbnb',
  'confirmation',
  'e-ticket',
  'eticket',
  'pnr',
];

function normalizeBlob(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Stable layout fingerprint — not a booking id (no PNR alone). */
export function fingerprintIntakeLayout(raw: string, subject?: string): string {
  const blob = normalizeBlob(`${subject || ''}\n${raw || ''}`).slice(0, 8000);
  const hints = PROVIDER_HINTS.filter((h) => blob.includes(h)).slice(0, 6);
  const hasPnr = /\b[A-Z0-9]{5,7}\b/.test((raw || '').toUpperCase());
  const hasIsoDate = /\b20\d{2}-\d{2}-\d{2}\b/.test(raw || '');
  const hasMoney = /\$\s?\d|\busd\b|\beur\b/i.test(raw || '');
  const lineShape = (raw || '')
    .split('\n')
    .slice(0, 40)
    .map((l) => (/^\s*[A-Za-z][A-Za-z /]{1,40}:/.test(l) ? 'L' : l.trim() ? 'T' : 'E'))
    .join('')
    .slice(0, 40);
  const basis = [
    hints.join('+') || 'generic',
    hasPnr ? 'pnr' : 'nopnr',
    hasIsoDate ? 'date' : 'nodate',
    hasMoney ? 'money' : 'nomoney',
    lineShape || 'shape',
  ].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build regex rules by locating AI field values inside the original raw text. */
export function buildExtractRulesFromAiPaste(
  raw: string,
  aiPaste: string,
): { rules: IntakeExtractRule[]; labels: string[]; fieldCount: number } {
  const preview = parseQuickPaste(aiPaste);
  const rules: IntakeExtractRule[] = [];
  const labels: string[] = [];
  const rawNorm = raw || '';

  for (const [key, value] of Object.entries(preview.fields)) {
    if (value == null) continue;
    const str = String(value).trim();
    if (!str || /^(unknown|n\/a|not applicable)$/i.test(str)) continue;
    labels.push(key);
    // Prefer labeled line; fall back to literal value occurrence.
    const labelName = key.replace(/_/g, '[ _]?');
    const labeled = new RegExp(`${labelName}\\s*:\\s*(.+)`, 'i');
    if (labeled.test(aiPaste) || labeled.test(rawNorm)) {
      rules.push({ label: key, regex: `${labelName}\\s*:\\s*(.+)` });
      continue;
    }
    if (str.length >= 3 && rawNorm.toLowerCase().includes(str.toLowerCase())) {
      rules.push({
        label: key,
        regex: `(${escapeRegExp(str)})`,
      });
    }
  }

  return { rules, labels, fieldCount: labels.length };
}

function applyRules(raw: string, rules: IntakeExtractRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    try {
      const re = new RegExp(rule.regex, 'i');
      const m = (raw || '').match(re);
      const cap = m?.[1]?.trim();
      if (cap && !/^(unknown|n\/a)$/i.test(cap)) out[rule.label] = cap.slice(0, 500);
    } catch {
      /* bad regex — skip */
    }
  }
  return out;
}

function fieldsToPaste(fields: Record<string, string>): string {
  const order = [
    'customer',
    'traveler',
    'product',
    'trip_type',
    'airline',
    'property',
    'route',
    'travel_start',
    'travel_end',
    'primary_reference',
    'sale',
    'seller_cost',
    'notes',
    'reservation_summary',
  ];
  const labelMap: Record<string, string> = {
    customer: 'Customer',
    traveler: 'Traveler',
    product: 'Product',
    trip_type: 'Trip Type',
    airline: 'Airline',
    property: 'Property',
    route: 'Route',
    travel_start: 'Departure',
    travel_end: 'Return',
    primary_reference: 'PNR',
    sale: 'Customer Price',
    seller_cost: 'Seller Cost',
    notes: 'Notes',
    reservation_summary: 'Summary',
  };
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    if (fields[key] == null || seen.has(key)) continue;
    seen.add(key);
    lines.push(`${labelMap[key] || key}: ${fields[key]}`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (seen.has(key)) continue;
    lines.push(`${key}: ${value}`);
  }
  return lines.join('\n');
}

async function tableReady(db: SQL): Promise<boolean> {
  try {
    const row = (
      await db.query(`SELECT to_regclass('padova.intake_extract_patterns') AS name`)
    ).rows[0];
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

/** Try learned pattern before AI. Never invents money — only copies captured substrings. */
export async function tryLearnedIntakePaste(
  db: SQL | null | undefined,
  raw: string,
  subject?: string,
): Promise<IntakePatternHit | null> {
  if (!raw?.trim()) return null;
  const fingerprint = fingerprintIntakeLayout(raw, subject);

  const mem = memoryPatterns.get(fingerprint);
  if (mem && !mem.disabled) {
    const fields = applyRules(raw, mem.extract_rules);
    if (Object.keys(fields).length >= MIN_FIELDS_TO_APPLY) {
      mem.hit_count += 1;
      return {
        fingerprint,
        paste: fieldsToPaste(fields),
        field_labels: Object.keys(fields),
        pattern_id: mem.id,
      };
    }
  }

  if (!db || !(await tableReady(db))) return null;

  try {
    const row = (
      await db.query(
        `SELECT id::text AS id, field_labels, extract_rules, sample_paste, hit_count
         FROM intake_extract_patterns
         WHERE fingerprint=$1 AND disabled=false
         LIMIT 1`,
        [fingerprint],
      )
    ).rows[0];
    if (!row) return null;
    const rules = Array.isArray(row.extract_rules)
      ? (row.extract_rules as IntakeExtractRule[])
      : [];
    const fields = applyRules(raw, rules);
    if (Object.keys(fields).length < MIN_FIELDS_TO_APPLY) return null;

    void db
      .query(
        `UPDATE intake_extract_patterns
         SET hit_count=hit_count+1, last_hit_at=now(), updated_at=now()
         WHERE id=$1::uuid`,
        [row.id],
      )
      .catch(() => undefined);

    memoryPatterns.set(fingerprint, {
      id: String(row.id),
      field_labels: row.field_labels || Object.keys(fields),
      extract_rules: rules,
      sample_paste: String(row.sample_paste || ''),
      hit_count: Number(row.hit_count || 0) + 1,
      disabled: false,
    });

    return {
      fingerprint,
      paste: fieldsToPaste(fields),
      field_labels: Object.keys(fields),
      pattern_id: String(row.id),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a successful AI extract as a reusable pattern.
 * Fire-and-forget safe: never throws to caller; never blocks booking path.
 */
export function learnIntakePatternFireAndForget(
  db: SQL | null | undefined,
  input: { raw: string; subject?: string; aiPaste: string; source_hint?: string },
): void {
  void learnIntakePattern(db, input).catch(() => undefined);
}

export async function learnIntakePattern(
  db: SQL | null | undefined,
  input: { raw: string; subject?: string; aiPaste: string; source_hint?: string },
): Promise<{ saved: boolean; reason?: string }> {
  try {
    const { rules, labels, fieldCount } = buildExtractRulesFromAiPaste(
      input.raw,
      input.aiPaste,
    );
    if (fieldCount < MIN_FIELDS_TO_LEARN || rules.length < MIN_FIELDS_TO_LEARN) {
      return { saved: false, reason: 'too_few_fields' };
    }
    const fingerprint = fingerprintIntakeLayout(input.raw, input.subject);

    memoryPatterns.set(fingerprint, {
      field_labels: labels,
      extract_rules: rules,
      sample_paste: input.aiPaste.slice(0, 20000),
      hit_count: 0,
      disabled: false,
    });
    while (memoryPatterns.size > MEMORY_CAP) {
      const first = memoryPatterns.keys().next().value;
      if (first) memoryPatterns.delete(first);
      else break;
    }

    if (!db || !(await tableReady(db))) {
      return { saved: true, reason: 'memory_only' };
    }

    await db.query(
      `INSERT INTO intake_extract_patterns(
         fingerprint, source_hint, field_labels, extract_rules, sample_paste, disabled, updated_at
       ) VALUES ($1,$2,$3,$4::jsonb,$5,false,now())
       ON CONFLICT (fingerprint) DO UPDATE SET
         field_labels=EXCLUDED.field_labels,
         extract_rules=EXCLUDED.extract_rules,
         sample_paste=EXCLUDED.sample_paste,
         disabled=false,
         version=intake_extract_patterns.version+1,
         updated_at=now()`,
      [
        fingerprint,
        String(input.source_hint || '').slice(0, 80),
        labels,
        JSON.stringify(rules),
        input.aiPaste.slice(0, 20000),
      ],
    );

    // Cap table size — drop lowest-hit disabled-ready rows.
    await db.query(
      `DELETE FROM intake_extract_patterns
       WHERE id IN (
         SELECT id FROM intake_extract_patterns
         ORDER BY disabled DESC, hit_count ASC, updated_at ASC
         OFFSET $1
       )`,
      [DB_CAP],
    );

    return { saved: true };
  } catch (e) {
    return {
      saved: false,
      reason: e instanceof Error ? e.message.slice(0, 120) : 'learn_failed',
    };
  }
}

/** Test helper — clear warm memory. */
export function resetIntakePatternMemory(): void {
  memoryPatterns.clear();
}
