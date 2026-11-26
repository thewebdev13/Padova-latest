/**
 * Plan v1 — Points/FHR trading desk (10-second layer).
 * Always-visible: Buy|Sell, What, Amount, Total price. Rate calculated, never typed.
 * Status: offered · agreed · paid · delivered (one trade record).
 * Posts through existing acquire_asset / sell_asset ledgers — no separate money model.
 */

export const TRADE_WHATS = [
  'Points',
  'FHR credit',
  'Hotel credit',
  'Airline credit',
  'Voucher',
  'Gift card',
  'Free-night certificate',
  'Companion certificate',
  'Other benefit',
] as const;

/** Plan: owner adds new kinds without a programmer — pick Other and type the name. */
export const TRADE_WHAT_OTHER = 'Other…';

export type TradeWhatBuiltin = (typeof TRADE_WHATS)[number];
/** Built-in or owner-added kind name (never invent money from the label). */
export type TradeWhat = string;
export type TradeSide = 'Buy' | 'Sell';
export type TradeStockMode = 'for_booking' | 'hold_in_stock';

/**
 * Plan: short What drop-down the owner can extend.
 * Merges built-ins with kinds already used on assets / instruments (no hard-coded weekly list).
 */
export function mergeTradeWhatOptions(
  extras: Array<string | null | undefined> = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const s = String(raw || '').trim();
    if (!s || s === TRADE_WHAT_OTHER) return;
    const key = s.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const w of TRADE_WHATS) add(w);
  for (const e of extras) add(e);
  out.push(TRADE_WHAT_OTHER);
  return out;
}

/** Resolve form What (+ optional custom) to the stored kind name. */
export function resolveTradeWhat(
  what: string | null | undefined,
  whatCustom?: string | null,
): string {
  const selected = String(what || '').trim();
  if (selected === TRADE_WHAT_OTHER || selected === 'Other') {
    const custom = String(whatCustom || '').trim();
    return custom ? custom.slice(0, 80) : '';
  }
  return selected || 'Points';
}

export function normalizeTradeWhat(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s || s === TRADE_WHAT_OTHER) return 'Points';
  return s.slice(0, 80);
}

/** Plan: status (offered, agreed, paid, delivered). */
export const TRADE_STATUSES = ['offered', 'agreed', 'paid', 'delivered'] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

/** Default when facts do not force paid/delivered — deal locked, money not yet settled. */
export const TRADE_DEFAULT_STATUS: TradeStatus = 'agreed';

const TRADE_STATUS_RE = /Trade status:\s*(offered|agreed|paid|delivered)\b/i;

export function tradeStatusLabel(status: string | null | undefined): string {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (s === 'offered') return 'Offered';
  if (s === 'agreed') return 'Agreed';
  if (s === 'paid') return 'Paid';
  if (s === 'delivered') return 'Delivered';
  return 'Incomplete';
}

/**
 * Suggest Plan trade status from desk facts.
 * Incomplete optional facts → offered; sell+paid → paid; buy posting into stock → delivered.
 * Never invents money amounts.
 */
export function suggestTradeStatus(input: {
  side?: string | null;
  paid?: boolean | null;
  to_complete?: string[] | null;
}): TradeStatus {
  if (input.side === 'Sell' && input.paid === true) return 'paid';
  if (Array.isArray(input.to_complete) && input.to_complete.length > 0) return 'offered';
  if (input.side === 'Buy') return 'delivered';
  return TRADE_DEFAULT_STATUS;
}

export function parseTradeStatus(text: string | null | undefined): TradeStatus | null {
  const m = String(text || '').match(TRADE_STATUS_RE);
  if (!m) return null;
  return m[1].toLowerCase() as TradeStatus;
}

/** Append or replace `Trade status: …` in notes / restrictions (append-only label, no money). */
export function encodeTradeStatusInNotes(
  notes: string | null | undefined,
  status: TradeStatus,
): string {
  const cleaned = String(notes || '')
    .replace(/\n?Trade status:\s*(offered|agreed|paid|delivered)\b/gi, '')
    .trim();
  const line = `Trade status: ${status}`;
  return cleaned ? `${cleaned}\n${line}` : line;
}

/** Persist Plan "To complete" list on the trade record (never blocks save). */
export function encodeTradeToCompleteInNotes(
  notes: string | null | undefined,
  items: string[] | null | undefined,
): string {
  const cleaned = String(notes || '')
    .replace(/\n?To complete:\s*[^\n]*/gi, '')
    .trim();
  const list = (items ?? []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!list.length) return cleaned;
  const line = `To complete: ${[...new Set(list)].join(' · ')}`;
  return cleaned ? `${cleaned}\n${line}` : line;
}

export function parseTradeToComplete(text: string | null | undefined): string[] {
  const m = String(text || '').match(/To complete:\s*([^\n]+)/i);
  if (!m) return [];
  return [
    ...new Set(
      m[1]
        .split(/\s*·\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Assets (buy trades) with a persisted To complete list — Plan follow-up surface. */
export function listTradesToComplete(
  assets: Array<{
    id?: string | null;
    name?: string | null;
    restrictions?: string | null;
    reference?: string | null;
  } | null | undefined>,
): Array<{ id: string; name: string; missing: string[] }> {
  const out: Array<{ id: string; name: string; missing: string[] }> = [];
  for (const a of assets ?? []) {
    if (!a?.id) continue;
    const missing = [
      ...parseTradeToComplete(a.restrictions),
      ...parseTradeToComplete(a.reference),
    ];
    const uniq = [...new Set(missing)];
    if (!uniq.length) continue;
    out.push({
      id: String(a.id),
      name: String(a.name || '').trim() || 'Trade',
      missing: uniq,
    });
  }
  return out;
}

/**
 * Plan Trade desk search: name · missing facts · id.
 * Blank query → match all; empty fields never invent a hit.
 */
export function tradeToCompleteMatchesSearch(
  row: { id?: string | null; name?: string | null; missing?: readonly string[] | null },
  query: string | null | undefined,
): boolean {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [row.name, row.id, ...(row.missing ?? [])]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

/** Prefix sell reference with trade status when sell_asset has no notes field. */
export function encodeTradeStatusInReference(
  reference: string | null | undefined,
  status: TradeStatus,
): string {
  const cleaned = String(reference || '')
    .replace(/^Trade status:\s*(offered|agreed|paid|delivered)\s*[·•-]?\s*/i, '')
    .trim();
  const prefix = `Trade status: ${status}`;
  return cleaned ? `${prefix} · ${cleaned}` : prefix;
}

/** Plan Owner (Nov 25): most buys are for a booking; hold-in-stock is the opt-in. */
export const TRADE_DEFAULT_STOCK_MODE: TradeStockMode = 'for_booking';

export const TRADE_STOCK_MODE_OPTIONS: Array<{ value: TradeStockMode; label: string }> = [
  { value: 'for_booking', label: 'For this booking' },
  { value: 'hold_in_stock', label: 'Hold in stock' },
];

/**
 * Plan: layer-1 fields alone may save; missing optional facts go on a "to complete"
 * list — never a blocking warning popup.
 */
export function tradeToComplete(input: {
  side?: string | null;
  stock_mode?: string | null;
  booking_id?: string | null;
  counterparty_id?: string | null;
  asset_id?: string | null;
  expires_on?: string | null;
  notes?: string | null;
  what?: string | null;
}): string[] {
  const side = String(input.side || 'Buy');
  const items: string[] = [];
  if (side === 'Buy') {
    const mode = String(input.stock_mode || TRADE_DEFAULT_STOCK_MODE);
    if (mode === 'for_booking' && !String(input.booking_id || '').trim()) {
      items.push('Linked booking');
    }
    if (!String(input.counterparty_id || '').trim()) items.push('Counterparty');
  } else {
    if (!String(input.asset_id || '').trim()) items.push('Asset / batch to sell');
    if (!String(input.counterparty_id || '').trim()) items.push('Buyer');
  }
  const what = String(input.what || '');
  if (
    /certificate|voucher|credit|gift/i.test(what) &&
    !String(input.expires_on || '').trim()
  ) {
    items.push('Expiration');
  }
  return items;
}

/** Face/points kinds use quantity as whole units; monetary credits use cents face. */
export function tradeUnit(what: TradeWhat): 'points' | 'money' | 'count' {
  const w = String(what || '').trim();
  if (w === 'Points' || /^points\b/i.test(w) || /\bmiles\b/i.test(w)) return 'points';
  if (
    w === 'Free-night certificate' ||
    w === 'Companion certificate' ||
    /certificate|free.?night/i.test(w)
  ) {
    return 'count';
  }
  return 'money';
}

export function tradeAssetKind(what: TradeWhat): string {
  return normalizeTradeWhat(what);
}

/** Exact cents-per-unit × 100 (hundredths of a cent); null when incomplete / non-exact. */
export function tradeRateMilliCentsPerUnit(
  amountUnits: number | null | undefined,
  totalPriceCents: number | null | undefined,
): number | null {
  if (amountUnits == null || totalPriceCents == null) return null;
  if (!Number.isFinite(amountUnits) || !Number.isFinite(totalPriceCents)) return null;
  if (amountUnits <= 0) return null;
  const num = BigInt(Math.trunc(totalPriceCents)) * 100n;
  const den = BigInt(Math.trunc(amountUnits));
  if (num % den !== 0n) return null;
  return Number(num / den);
}

export function formatTradeRateLabel(
  what: TradeWhat,
  amountUnits: number | null | undefined,
  totalPriceCents: number | null | undefined,
): string {
  if (amountUnits == null || totalPriceCents == null || amountUnits <= 0) return 'Rate incomplete';
  const unit = tradeUnit(what);
  if (unit === 'points') {
    const milli = tradeRateMilliCentsPerUnit(amountUnits, totalPriceCents);
    if (milli == null) {
      const approx = totalPriceCents / amountUnits;
      return `~${approx.toFixed(2)}¢ / pt`;
    }
    const cpp = milli / 100;
    return Number.isInteger(cpp) ? `${cpp}¢ / pt` : `${cpp.toFixed(2)}¢ / pt`;
  }
  // Monetary face: show % of face when exact bps
  const num = BigInt(Math.trunc(totalPriceCents)) * 10000n;
  const den = BigInt(Math.trunc(amountUnits));
  if (num % den !== 0n) {
    const pct = (totalPriceCents / amountUnits) * 100;
    return `~${pct.toFixed(2)}% of face`;
  }
  const bps = Number(num / den);
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}% of face` : `${pct.toFixed(2)}% of face`;
}

export function tradeBuyName(what: TradeWhat, amountUnits: number): string {
  const unit = tradeUnit(what);
  if (unit === 'points') return `${what} · ${amountUnits.toLocaleString()} pts`;
  if (unit === 'count') return `${what} · ${amountUnits}`;
  return `${what} · $${(amountUnits / 100).toFixed(2)} face`;
}

/** Map desk fields → acquire_asset payload (cents / whole units already). */
export function buildTradeBuyPayload(input: {
  what: TradeWhat;
  amount_units: number;
  price_cents: number;
  counterparty_id?: string | null;
  date: string;
  expires_on?: string | null;
  notes?: string;
  booking_id?: string | null;
  stock_mode: TradeStockMode;
  reference?: string;
  status?: TradeStatus | null;
  to_complete?: string[] | null;
}) {
  const unit = tradeUnit(input.what);
  const quantity =
    unit === 'money' ? input.amount_units /* already cents face */ : input.amount_units;
  const missing =
    input.to_complete ??
    tradeToComplete({
      side: 'Buy',
      stock_mode: input.stock_mode,
      booking_id: input.booking_id,
      counterparty_id: input.counterparty_id,
      expires_on: input.expires_on,
      what: input.what,
    });
  const status =
    input.status || suggestTradeStatus({ side: 'Buy', to_complete: missing });
  return {
    name: tradeBuyName(input.what, quantity),
    kind: tradeAssetKind(input.what),
    unit,
    issuer: input.what,
    quantity,
    cost: input.price_cents,
    date: input.date,
    expires_on: input.expires_on || undefined,
    seller_id: input.counterparty_id || undefined,
    ownership: 'Padova' as const,
    restrictions: encodeTradeToCompleteInNotes(
      encodeTradeStatusInNotes(input.notes || '', status),
      missing,
    ),
    reference: input.reference || '',
    source_booking_id:
      input.stock_mode === 'for_booking' && input.booking_id ? input.booking_id : undefined,
  };
}

/** Map desk fields → sell_asset payload. */
export function buildTradeSellPayload(input: {
  asset_id: string;
  amount_units: number;
  price_cents: number;
  counterparty_id: string;
  date: string;
  paid?: boolean;
  method?: string;
  reference?: string;
  what: TradeWhat;
  status?: TradeStatus | null;
}) {
  const unit = tradeUnit(input.what);
  const status =
    input.status ||
    suggestTradeStatus({ side: 'Sell', paid: input.paid === true });
  return {
    asset_id: input.asset_id,
    buyer_id: input.counterparty_id,
    quantity: unit === 'money' ? input.amount_units : input.amount_units,
    proceeds: input.price_cents,
    date: input.date,
    paid: input.paid === true,
    method: input.method || 'Zelle',
    reference: encodeTradeStatusInReference(input.reference || '', status),
  };
}
