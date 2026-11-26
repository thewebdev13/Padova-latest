import manifest from './padova-manifest.json';
import type { Database, SQL } from './db';
import type { AuthProvider } from './supabase-auth';

const special = [
  'payments',
  'payment_allocations',
  'payment_allocation_reversals',
  'commands',
  'refunds',
  'refund_movements',
  'payment_balances',
  'asset_balances',
  'booking_balances',
  'net_allocations',
];
const relations: Record<string, string> = Object.fromEntries(
  Object.entries(manifest).map(([name, value]) => [
    name,
    `padova.${value.native ? value.base : 'app_' + name}`,
  ]),
);
for (const name of special) relations[name] = 'padova.app_' + name;
// Separate incremental extension; the installed adapter manifest is immutable.
for (const name of [
  'programs',
  'instruments',
  'program_accounts',
  'travel_components',
  'inventory_profiles',
  'fulfillment_details',
  'funding_asset_uses',
  'expected_events',
  'expected_event_updates',
  'booking_source_methods',
  'booking_source_profiles',
  'source_profile_assets',
  'booking_references',
  'booking_drafts',
  'obligation_settlements',
  'review_resolution_events',
  'commission_payable_revisions',
  'commission_payout_adjustments',
  'fee_settings',
  'invoice_drafts',
  'booking_relations',
])
  relations[name] = `padova.${name}`;

/** Lex SQL without touching strings, comments, quoted identifiers or dollar bodies. */
export function padovaSQL(sql: string): string {
  let relation = false,
    previous = '';
  return sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|\$([a-zA-Z_]\w*)?\$[\s\S]*?\$\1\$|\b[a-zA-Z_]\w*\b/g,
    (token, _tag, offset: number) => {
      if (!/^[a-z_]\w*$/i.test(token)) return token;
      const lower = token.toLowerCase(),
        target = relation;
      relation = false;
      if (
        ['from', 'join', 'into'].includes(lower) ||
        (lower === 'update' && !['for', 'do'].includes(previous))
      )
        relation = true;
      const qualified = /^\s*\./.test(sql.slice(offset + token.length));
      previous = lower;
      if (sql[offset - 1] === '.') return token;
      if (target && relations[lower]) return relations[lower];
      if (qualified && relations[lower]) return relations[lower].split('.').at(-1)!;
      return token;
    },
  );
}
function adapted(tx: SQL, provider?: AuthProvider): SQL {
  return {
    storage: 'padova',
    authProvider: provider,
    query: (q, v) => tx.query(padovaSQL(q), v),
    exec: async () => {
      throw new Error('Runtime adapter cannot execute migration SQL');
    },
  };
}
export function padovaStorage(raw: Database, provider?: AuthProvider): Database {
  return {
    ...adapted(raw, provider),
    close: () => raw.close(),
    dump: raw.dump ? () => raw.dump!() : undefined,
    transaction: (fn) =>
      raw.transaction(async (tx) => {
        await tx.query('SET LOCAL search_path=padova,pg_catalog');
        return fn(adapted(tx, provider));
      }),
  };
}
export function centsToDecimal(value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 9000000000000)
    throw new Error('Unsafe monetary cents');
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function decimalToCents(value: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Expected exact decimal money');
  const negative = value.startsWith('-'),
    [whole, part = ''] = value.replace(/^-/, '').split('.');
  const n = (BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (n > 9000000000000n || n < -9000000000000n) throw new Error('Unsafe monetary amount');
  return Number(n);
}
