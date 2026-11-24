import { normalizePasteValue, parseQuickPaste, type PastePreview } from './quick-paste';
import { intakeReservationBlockReason } from './booking-message-detect';

/** Client-facing copy when PDF/image cannot be read (Site Feedback 3). */
export const UNREAD_FILE_MESSAGE =
  "We couldn't read this file – paste the text instead";

/** Client sample paste used in Site Feedback 3 mock. */
export const INTAKE_SAMPLE_PASTE = `Customer: QA Alex Morgan
Guest: Minindy Quirona
Product: Hotel
Location: Miami
Booking reference number: 123456003
Price: $200`;

export type IntakePasteLine = {
  id: string;
  label: string;
  value: string;
};

export type IntakePreviewRow = {
  id: string;
  fieldLabel: string;
  /** Original paste label, e.g. Guest → Traveler */
  sourceLabel?: string;
  /** Extra status under the source line, e.g. existing person */
  sourceHint?: string;
  value: string;
  status: 'found' | 'missing';
  /** Canonical Field: label used when remapping into paste text */
  canonicalLabel: string;
};

/** Manual remap: row id → paste line id, or '' to clear */
export type IntakeFieldOverrides = Record<string, string>;

export type IntakeMappingPreview = {
  paste: PastePreview;
  rows: IntakePreviewRow[];
  lines: IntakePasteLine[];
  found: number;
  missing: number;
  product: string;
  unread: boolean;
  unreadMessage?: string;
  /** Non-null when text is not a verified new booking confirmation. */
  reservationBlock?: string | null;
};

/** Canonical paste labels for each preview row (used when remapping). */
export const INTAKE_ROW_CANONICAL: Record<string, string> = {
  customer: 'Customer',
  traveler: 'Traveler',
  product: 'Product',
  route: 'Location',
  primary_reference: 'Confirmation',
  sale: 'Customer Price',
  dates: 'Check-in',
};

/** Highlight these when missing so staff can remap / fill before create. */
export const INTAKE_REQUIRED_ROWS = new Set([
  'customer',
  'product',
  'primary_reference',
  'sale',
]);

function productLabel(raw: string | undefined): string {
  if (!raw) return '';
  const hit = ['Flight', 'Hotel', 'Car', 'Other'].find(
    (p) => normalizePasteValue(p) === normalizePasteValue(raw),
  );
  return hit ?? String(raw);
}

function confirmationFieldLabel(product: string): string {
  return product === 'Flight' ? 'PNR' : 'Confirmation #';
}

function locationFieldLabel(product: string): string {
  if (product === 'Hotel') return 'Location';
  if (product === 'Car') return 'Pickup / route';
  return 'Route';
}

function partyHint(
  name: string | undefined,
  parties: { name?: string }[] | undefined,
): string | undefined {
  if (!name?.trim() || !parties?.length) return undefined;
  const wanted = normalizePasteValue(name);
  const hits = parties.filter((p) => normalizePasteValue(String(p.name || '')) === wanted);
  if (hits.length === 1) return 'existing person';
  if (hits.length > 1) return 'multiple matches, confirm';
  return 'new, confirm on save';
}

/** Every Field: Value line from paste (known + unknown) for remap dropdowns. */
export function listIntakePasteLines(raw: string): IntakePasteLine[] {
  const lines: IntakePasteLine[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const named = trimmed.match(/^([A-Za-z][A-Za-z0-9 #/._-]{0,48}):\s*(.*)$/);
    if (!named) continue;
    const label = named[1].trim();
    const value = named[2].trim();
    if (!value) continue;
    const key = `${normalizePasteValue(label)}::${normalizePasteValue(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Stable id so remaps survive re-parse of the same paste.
    lines.push({ id: key.slice(0, 160), label, value });
  }
  return lines;
}

function formatSaleDisplay(raw: string): string {
  let priceDisplay = String(raw).trim();
  if (/^\$?\d+(\.\d+)?$/.test(priceDisplay.replace(/,/g, ''))) {
    const n = Number(priceDisplay.replace(/[$,]/g, ''));
    if (Number.isFinite(n)) return `$${n.toFixed(2)}`;
  }
  if (!priceDisplay.startsWith('$')) return `$${priceDisplay}`;
  return priceDisplay;
}

/**
 * Apply staff remaps onto paste text before draft create.
 * Replaces/appends canonical Field: Value lines — never invents amounts.
 */
export function applyIntakeFieldOverrides(
  raw: string,
  rows: IntakePreviewRow[],
  overrides: IntakeFieldOverrides,
  lines: IntakePasteLine[],
): string {
  if (!Object.keys(overrides).length) return raw;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const replacements = new Map<string, string | null>();
  for (const row of rows) {
    if (!(row.id in overrides)) continue;
    const pick = overrides[row.id];
    const canonical = row.canonicalLabel || INTAKE_ROW_CANONICAL[row.id] || row.fieldLabel;
    if (!pick) {
      replacements.set(normalizePasteValue(canonical), null);
      continue;
    }
    const line = byId.get(pick);
    if (!line) continue;
    replacements.set(normalizePasteValue(canonical), `${canonical}: ${line.value}`);
  }
  if (!replacements.size) return raw;
  const out: string[] = [];
  const consumed = new Set<string>();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const named = line.trim().match(/^([A-Za-z][A-Za-z0-9 #/._-]{0,48}):\s*(.*)$/);
    if (!named) {
      out.push(line);
      continue;
    }
    const key = normalizePasteValue(named[1]);
    if (!replacements.has(key)) {
      out.push(line);
      continue;
    }
    consumed.add(key);
    const next = replacements.get(key);
    if (next) out.push(next);
  }
  for (const [key, next] of replacements) {
    if (consumed.has(key) || !next) continue;
    out.push(next);
  }
  return out.join('\n').trim();
}

/**
 * Build the “What we’ll fill in” preview (Site Feedback 3 client sample).
 * Does not create drafts, parties, or money.
 */
export function buildIntakeMappingPreview(
  raw: string,
  options: {
    unread?: boolean;
    unreadMessage?: string;
    parties?: { name?: string }[];
    overrides?: IntakeFieldOverrides;
  } = {},
): IntakeMappingPreview {
  const lines = listIntakePasteLines(raw);
  if (options.unread) {
    return {
      paste: { fields: {}, fieldSources: {}, unknown: [], issues: [] },
      rows: [],
      lines,
      found: 0,
      missing: 0,
      product: '',
      unread: true,
      unreadMessage: options.unreadMessage || UNREAD_FILE_MESSAGE,
    };
  }

  const paste = parseQuickPaste(raw || '');
  const f = paste.fields;
  const src = paste.fieldSources;
  const product = productLabel(typeof f.product === 'string' ? f.product : undefined);
  const overrides = options.overrides || {};
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const rows: IntakePreviewRow[] = [];

  const push = (
    id: string,
    fieldLabel: string,
    key: string | null,
    value: string | undefined,
    extras?: { sourceKey?: string; sourceHint?: string; canonicalLabel?: string },
  ) => {
    const canonicalLabel =
      extras?.canonicalLabel || INTAKE_ROW_CANONICAL[id] || fieldLabel;
    const overridePick = overrides[id];
    if (overridePick !== undefined) {
      if (!overridePick) {
        rows.push({
          id,
          fieldLabel,
          value: 'Not found – add after',
          status: 'missing',
          canonicalLabel,
          sourceHint: 'cleared',
        });
        return;
      }
      const line = lineById.get(overridePick);
      if (line) {
        const display =
          id === 'sale'
            ? formatSaleDisplay(line.value)
            : id === 'product'
              ? productLabel(line.value) || line.value
              : line.value;
        rows.push({
          id,
          fieldLabel,
          sourceLabel: line.label,
          sourceHint: 'remapped',
          value: display,
          status: 'found',
          canonicalLabel,
        });
        return;
      }
    }
    const v = value?.trim() || '';
    const sourceKey = extras?.sourceKey ?? key ?? undefined;
    const sourceLabel = sourceKey ? src[sourceKey] : undefined;
    if (v) {
      rows.push({
        id,
        fieldLabel,
        sourceLabel,
        sourceHint: extras?.sourceHint,
        value: v,
        status: 'found',
        canonicalLabel,
      });
    } else {
      rows.push({
        id,
        fieldLabel,
        value: 'Not found – add after',
        status: 'missing',
        canonicalLabel,
      });
    }
  };

  push('customer', 'Customer', 'customer', f.customer, {
    sourceHint: partyHint(f.customer, options.parties),
  });
  push('traveler', 'Traveler', 'traveler', f.traveler, {
    sourceHint: partyHint(f.traveler, options.parties),
  });
  push('product', 'Product', 'product', product || undefined);
  push('route', locationFieldLabel(product), 'route', f.route, {
    canonicalLabel: locationFieldLabel(product),
  });
  push(
    'primary_reference',
    confirmationFieldLabel(product),
    'primary_reference',
    f.primary_reference,
    { canonicalLabel: confirmationFieldLabel(product) },
  );

  if (f.sale !== undefined) {
    push('sale', 'Customer price', 'sale', formatSaleDisplay(String(f.sale)));
  } else {
    push('sale', 'Customer price', 'sale', undefined);
  }

  const checkIn = f.travel_start ? String(f.travel_start) : '';
  const checkOut = f.travel_end ? String(f.travel_end) : '';
  const datesLabel =
    product === 'Hotel'
      ? 'Check-in / out'
      : product === 'Car'
        ? 'Pick-up / drop-off'
        : 'Travel dates';
  if (checkIn || checkOut) {
    push(
      'dates',
      datesLabel,
      checkIn ? 'travel_start' : 'travel_end',
      [checkIn, checkOut].filter(Boolean).join(' → '),
      {
        sourceKey: checkIn ? 'travel_start' : 'travel_end',
        canonicalLabel: checkIn ? 'Check-in' : 'Check-out',
      },
    );
  } else {
    push('dates', datesLabel, null, undefined);
  }

  const reservationBlock = intakeReservationBlockReason(raw || '');
  const found = reservationBlock
    ? 0
    : rows.filter((r) => r.status === 'found').length;
  const missing = rows.filter((r) => r.status === 'missing').length;
  return {
    paste,
    rows: reservationBlock
      ? rows.map((r) =>
          r.status === 'found'
            ? {
                ...r,
                sourceHint: r.sourceHint
                  ? `${r.sourceHint} · verify (not a new booking confirm)`
                  : 'verify (not a new booking confirm)',
              }
            : r,
        )
      : rows,
    lines,
    found,
    missing,
    product: reservationBlock ? '' : product,
    unread: false,
    reservationBlock: reservationBlock || null,
  };
}
