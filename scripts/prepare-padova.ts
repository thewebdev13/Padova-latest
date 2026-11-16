/** Generates REVIEW-ONLY local SQL. Never connects to or mutates a cloud database. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createDatabase, migrate } from '../src/lib/db';

const installedManifest = JSON.parse(await readFile('db/padova/object-summary.json', 'utf8'));
if (installedManifest.status === 'INSTALLED')
  throw new Error(
    'Adapter is already installed. Preserve deployed artifacts; prepare a separate incremental migration.',
  );

const source = await createDatabase(true),
  legacy = await createDatabase(true);
await migrate(source);
await legacy.exec(await readFile('tests/fixtures/existing-padova.sql', 'utf8'));
type Col = {
  table_name: string;
  column_name: string;
  udt_name: string;
  column_default: string | null;
  is_nullable: string;
};
const cols = (db: typeof source, schema: string) =>
  db.query<Col>(
    `SELECT table_name,column_name,udt_name,column_default,is_nullable FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position`,
    [schema],
  );
const app = (await cols(source, 'public')).rows,
  old = (await cols(legacy, 'padova')).rows;
const primary = (
  await source.query(
    `SELECT c.table_name,k.column_name FROM information_schema.table_constraints c JOIN information_schema.key_column_usage k ON c.constraint_name=k.constraint_name AND c.table_schema=k.table_schema WHERE c.table_schema='public' AND c.constraint_type='PRIMARY KEY' ORDER BY k.ordinal_position`,
  )
).rows;
const qi = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const type = (c: Col) => (c.udt_name.startsWith('_') ? c.udt_name.slice(1) + '[]' : c.udt_name);
const money = new Set([
  'amount',
  'cost',
  'basis',
  'delta',
  'debit',
  'credit',
  'recognized_basis',
  'fixed_amount',
  'proceeds',
  'fees',
  'face_amount',
  'expected_basis',
  'customer_due',
  'supplier_expected',
  'retained',
  'gross',
]);
const tables = [...new Set(app.map((x) => x.table_name))].filter(
  (x) =>
    ![
      'payment_balances',
      'asset_balances',
      'booking_balances',
      'net_allocations',
      'migration_staging',
      'attachments',
    ].includes(x),
);
const special = new Set([
  'payments',
  'payment_allocations',
  'payment_allocation_reversals',
  'commands',
  'refunds',
  'refund_movements',
]);
const native = new Set([
  'traveler_private',
  'auth_throttles',
  'sessions',
  'password_reset_tokens',
  'personal_recovery_codes',
  'recovery_requests',
  'tasks',
  'attention_resolutions',
  'payment_accounts',
  'schema_migrations',
  'security_audit',
]);
const base: Record<string, string> = {
  referrals: 'referral_terms',
  payment_adjustments: 'receipt_adjustments',
  staff: 'staff',
  sessions: 'web_sessions',
  schema_migrations: 'app_schema_versions',
};
const rename: Record<string, Record<string, string>> = {
  staff: { id: 'user_id' },
  parties: { name: 'display_name' },
  party_relationships: { person_id: 'from_party', group_id: 'to_party' },
  bookings: {
    booked_on: 'booked_date',
    travel_start: 'travel_date',
    travel_end: 'end_date',
    reservation_status: 'status',
    revision: 'version',
  },
  booking_travelers: { person_id: 'traveler_id' },
  itinerary_revisions: { snapshot: 'itinerary' },
  charges: { effective_on: 'effective_date' },
  supplier_obligations: { effective_on: 'effective_date' },
  asset_movements: {
    basis: 'basis_delta',
    effective_on: 'effective_date',
    original_movement_id: 'app_original_movement_id',
  },
  assets: { source_booking_id: 'origin_booking_id' },
  funding_components: { cost: 'cost_basis', face_amount: 'face_amount' },
  asset_sales: { proceeds: 'proceeds_due', payment_id: 'receipt_id' },
  commissions: { retained: 'retention' },
  commission_allocations: { payment_id: 'receipt_id' },
  referrals: { after_receipt: 'after_commission_receipt' },
  referral_payments: { referral_id: 'terms_id' },
  profit_movements: { effective_on: 'effective_date' },
  audit_events: {
    actor: 'actor',
    kind: 'entity_table',
    record_id: 'entity_id',
    before_value: 'old_value',
    after_value: 'new_value',
  },
};
const read: Record<string, Record<string, string>> = {
  staff: {
    role: "CASE b.role WHEN 'owner' THEN 'OWNER' ELSE 'EMPLOYEE' END",
    email: 'b.app_email',
    name: 'COALESCE(b.app_name,b.app_email)',
    password_hash: 'NULL::text',
    permissions: "COALESCE(b.app_permissions,ARRAY['operations','edit_payments'])",
    auth_version: 'COALESCE(b.app_auth_version,1)',
    updated_at: 'COALESCE(b.app_updated_at,b.created_at)',
  },
  parties: { kind: 'COALESCE(b.app_kind,b.kind)' },
  bookings: { code: 'COALESCE(b.app_code,b.id::text)', product: 'COALESCE(b.app_product,b.kind)' },
  booking_travelers: {
    status:
      'COALESCE((SELECT s.status FROM padova.traveler_status_events s WHERE s.traveler_link_id=b.id ORDER BY s.created_at DESC,s.id DESC LIMIT 1),b.status)',
  },
  assets: { kind: 'COALESCE(b.app_kind,b.kind)' },
  asset_movements: {
    kind: 'COALESCE(b.app_kind,b.kind)',
    quantity:
      "COALESCE(b.app_quantity,CASE WHEN a.kind='points' THEN padova.app_whole(b.face_delta) ELSE padova.app_cents(b.face_delta) END)",
  },
  charges: { kind: "COALESCE(b.app_kind,CASE b.kind WHEN 'fare' THEN 'sale' ELSE b.kind END)" },
  funding_components: {
    kind: 'COALESCE(b.app_kind,b.kind)',
    face_amount:
      "CASE WHEN b.kind='points' THEN padova.app_whole(b.face_amount) ELSE padova.app_cents(b.face_amount) END",
  },
  commissions: {
    payer_id: 'COALESCE(b.app_payer_id,b.intermediary_id)',
    collector_id: 'b.app_collector_id',
    due_on: 'COALESCE(b.app_due_on,b.stay_end+30)',
  },
  referrals: {
    basis: "CASE b.basis WHEN 'fixed' THEN 'fixed' ELSE 'profit' END",
    rate_bps: 'padova.app_whole(COALESCE(b.percentage,0)*10000)',
    fixed_amount: 'padova.app_cents(COALESCE(b.fixed_amount,0))',
  },
  notes: {
    record_type:
      "COALESCE(b.app_record_type,CASE WHEN b.booking_id IS NOT NULL THEN 'booking' ELSE 'party' END)",
    record_id: 'COALESCE(b.app_record_id,b.booking_id,b.party_id)',
  },
};
const write: Record<string, Record<string, string>> = {
  staff: { role: "CASE NEW.role WHEN 'OWNER' THEN 'owner' ELSE 'staff' END" },
  parties: { kind: 'NEW.kind' },
  assets: {
    kind: "CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' WHEN NEW.kind='Capital One Credit' THEN 'capital_one_credit' ELSE 'voucher' END",
  },
  asset_movements: {
    kind: "CASE WHEN NEW.kind='sale' THEN 'sale' WHEN NEW.kind='expiration' THEN 'expiry' WHEN NEW.kind IN ('acquisition','earned_credit','voucherization','supplier_refund') THEN 'create' WHEN NEW.quantity>0 THEN 'return' ELSE 'use' END",
  },
  charges: { kind: "CASE WHEN NEW.kind='sale' THEN 'fare' ELSE 'adjustment' END" },
  funding_components: {
    kind: "CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' WHEN NEW.kind ~* 'voucher|credit' THEN 'voucher' WHEN NEW.kind ~* 'card' THEN 'card' ELSE 'cash' END",
    face_amount:
      "CASE WHEN NEW.kind ~* 'point|mile' THEN NEW.face_amount ELSE NEW.face_amount::numeric/100 END",
  },
  referrals: {
    basis: "CASE WHEN NEW.basis='fixed' THEN 'fixed' ELSE 'markup_profit' END",
    rate_bps: "CASE WHEN NEW.basis='fixed' THEN NULL ELSE NEW.rate_bps::numeric/10000 END",
    fixed_amount: "CASE WHEN NEW.basis='fixed' THEN NEW.fixed_amount::numeric/100 ELSE NULL END",
  },
};
const extra: Record<string, Record<string, string>> = {
  parties: { app_kind: 'NEW.kind' },
  bookings: { kind: "'standard'", verification: "'owner_confirmed'", app_managed: 'true' },
  confirmations: { kind: "'reservation'" },
  assets: {
    app_kind: 'NEW.kind',
    original_face:
      "CASE WHEN NEW.kind ~* 'point|mile' THEN NEW.opening_quantity ELSE NEW.opening_quantity::numeric/100 END",
    original_basis: 'NEW.opening_cost::numeric/100',
    verification: "'owner_confirmed'",
  },
  charges: { app_kind: 'NEW.kind', verification: "'owner_confirmed'" },
  supplier_obligations: { verification: "'owner_confirmed'" },
  asset_movements: {
    app_kind: 'NEW.kind',
    app_quantity: 'NEW.quantity',
    face_delta:
      "CASE WHEN (SELECT kind FROM padova.assets WHERE id=NEW.asset_id)='points' THEN NEW.quantity ELSE NEW.quantity::numeric/100 END",
  },
  funding_components: { app_kind: 'NEW.kind' },
  commissions: {
    intermediary_id: 'COALESCE(NEW.collector_id,NEW.payer_id)',
    stay_end: 'COALESCE((SELECT end_date FROM padova.bookings WHERE id=NEW.booking_id),NEW.due_on)',
  },
  asset_sales: {
    movement_id:
      "(SELECT id FROM padova.asset_movements WHERE app_command_id=NEW.command_id AND asset_id=NEW.asset_id AND kind='sale' ORDER BY created_at,id LIMIT 1)",
  },
  referral_payments: {
    paid_date: '(SELECT paid_on FROM padova.app_payments WHERE id=NEW.payment_id)',
    reference: "COALESCE((SELECT reference FROM padova.app_payments WHERE id=NEW.payment_id),'')",
  },
  referrals: { agreed_date: 'NEW.due_on' },
  profit_movements: {
    verification: "'unresolved'",
    reason:
      "COALESCE(NULLIF(current_setting('padova.reason',true),''),'Application command '||NEW.command_id)",
  },
  notes: {
    booking_id: "CASE WHEN NEW.record_type='booking' THEN NEW.record_id END",
    party_id: "CASE WHEN NEW.record_type='party' THEN NEW.record_id END",
  },
};
let sql = `-- REVIEW ONLY. Target existing US padova; no new schema, source-data writes or backfill.\n-- Generated by npm run adapter:prepare. Do not run against cloud without Owner review.\n`;
sql += `CREATE FUNCTION padova.app_cents(value numeric) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$ BEGIN IF value*100<>trunc(value*100) OR abs(value*100)>9000000000000 THEN RAISE EXCEPTION 'Money cannot be represented safely in application cents'; END IF; RETURN (value*100)::bigint; END $$;\n`;
sql += `CREATE FUNCTION padova.app_whole(value numeric) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$ BEGIN IF value<>trunc(value) OR abs(value)>9007199254740991 THEN RAISE EXCEPTION 'Quantity must be a safe whole number'; END IF; RETURN value::bigint; END $$;\nCREATE SEQUENCE padova.app_booking_number START 1001;\n`;
sql += `CREATE TABLE padova.traveler_status_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),traveler_link_id uuid NOT NULL REFERENCES padova.booking_travelers(id),status text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());\n`;
const manifest: Record<string, any> = {};
for (const table of tables) {
  if (special.has(table)) continue;
  const b = base[table] ?? table;
  const cs = app.filter((c) => c.table_name === table);
  const os = old.filter((c) => c.table_name === b);
  const exists = os.length > 0;
  const mappings: Record<string, string> = {};
  if (!exists)
    sql +=
      `CREATE TABLE padova.${qi(b)} (\n` +
      cs
        .map((c) => {
          const mt = money.has(c.column_name) && c.udt_name === 'int8';
          const def = c.column_default?.replaceAll(
            "'booking_number'::regclass",
            "'padova.app_booking_number'::regclass",
          );
          return (
            qi(c.column_name) +
            ' ' +
            (mt ? 'numeric(18,2)' : type(c)) +
            (def ? ` DEFAULT ${def}` : '') +
            (c.is_nullable === 'NO' ? ' NOT NULL' : '')
          );
        })
        .join(',\n') +
      `\n);\n`;
  for (const c of cs) {
    const name = c.column_name;
    if (table === 'staff' && name === 'password_hash') continue;
    let dest = rename[table]?.[name] ?? name;
    // Keep prior column meaning intact: application-only fields use a nullable app_ column.
    if (exists && !os.some((x) => x.column_name === dest)) dest = 'app_' + name;
    if (table === 'referrals' && name === 'rate_bps') dest = 'percentage';
    if (table === 'staff' && name === 'name') dest = 'app_name';
    if (table === 'notes' && ['record_type', 'record_id'].includes(name)) dest = 'app_' + name;
    if (exists && !os.some((x) => x.column_name === dest) && !['percentage'].includes(dest)) {
      const mt = money.has(name) && c.udt_name === 'int8';
      sql += `ALTER TABLE padova.${qi(b)} ADD COLUMN ${qi(dest)} ${mt ? 'numeric(18,2)' : type(c)};\n`;
    }
    mappings[name] = dest;
  }
  // Additional semantic metadata and required base-only columns.
  for (const [name, expr] of Object.entries(extra[table] ?? {}))
    if (name.startsWith('app_') && !Object.values(mappings).includes(name)) {
      sql += `ALTER TABLE padova.${qi(b)} ADD COLUMN ${qi(name)} ${name === 'app_managed' ? 'boolean' : name === 'app_quantity' ? 'bigint' : 'text'};\n`;
    }
  if (table === 'assets') {
    cs.push(
      {
        table_name: table,
        column_name: 'opening_quantity',
        udt_name: 'int8',
        column_default: null,
        is_nullable: 'YES',
      },
      {
        table_name: table,
        column_name: 'opening_cost',
        udt_name: 'int8',
        column_default: null,
        is_nullable: 'YES',
      },
    );
    mappings.opening_quantity = 'original_face';
    mappings.opening_cost = 'original_basis';
    (read.assets ??= {}).opening_quantity =
      "CASE WHEN b.kind='points' THEN padova.app_whole(b.original_face) ELSE padova.app_cents(b.original_face) END";
    read.assets.opening_cost = 'padova.app_cents(b.original_basis)';
  }
  manifest[table] = {
    base: b,
    columns: cs.map((c) => c.column_name),
    existing: exists,
    mapping: mappings,
    native: native.has(table),
  };
  if (native.has(table)) continue;
  const exprs = cs.map((c) => {
    const name = c.column_name,
      dest = mappings[name];
    let expression = read[table]?.[name] ?? (dest ? `b.${qi(dest)}` : 'NULL::text');
    if (!read[table]?.[name] && money.has(name) && c.udt_name === 'int8')
      expression = `padova.app_cents(${expression})`;
    if (
      !read[table]?.[name] &&
      c.udt_name === 'text' &&
      os.find((x) => x.column_name === dest)?.udt_name === 'uuid'
    )
      expression += '::text';
    return `${expression} AS ${qi(name)}`;
  });
  if (table === 'bookings') exprs.push('b.app_managed AS adapter_managed');
  sql += `CREATE VIEW padova.app_${table} WITH (security_invoker=true) AS SELECT ${exprs.join(',')} FROM padova.${qi(b)} b${table === 'asset_movements' ? ' JOIN padova.assets a ON a.id=b.asset_id' : ''};\n`;
  for (const c of cs)
    if (c.column_default)
      sql += `ALTER VIEW padova.app_${table} ALTER COLUMN ${qi(c.column_name)} SET DEFAULT ${c.column_default.replaceAll("'booking_number'::regclass", "'padova.app_booking_number'::regclass")};\n`;
  const vals: Record<string, string> = {};
  for (const c of cs) {
    const name = c.column_name,
      dest = mappings[name];
    if (!dest) continue;
    vals[dest] =
      write[table]?.[name] ??
      (money.has(name) && c.udt_name === 'int8'
        ? `NEW.${qi(name)}::numeric/100`
        : `NEW.${qi(name)}`);
    if (c.udt_name === 'text' && os.find((x) => x.column_name === dest)?.udt_name === 'uuid')
      vals[dest] += '::uuid';
  }
  Object.assign(vals, extra[table] ?? {});
  const pk = primary.filter((c) => c.table_name === table).map((c) => c.column_name as string);
  const where = pk.map((k) => `${qi(mappings[k])}=OLD.${qi(k)}`).join(' AND ');
  const updateSQL =
    table === 'booking_travelers'
      ? `INSERT INTO padova.traveler_status_events(traveler_link_id,status,actor) SELECT id,NEW.status,nullif(current_setting('request.jwt.claim.sub',true),'')::uuid FROM padova.booking_travelers WHERE ${where};`
      : (table === 'bookings'
          ? "IF NOT COALESCE(OLD.adapter_managed,false) THEN RAISE EXCEPTION 'Existing booking needs explicit compatibility review'; END IF; "
          : '') +
        `UPDATE padova.${qi(b)} SET ${Object.entries(vals)
          .filter(([k]) => !pk.some((p) => mappings[p] === k))
          .map(([k, v]) => `${qi(k)}=${v}`)
          .join(',')} WHERE ${where};`;
  sql += `CREATE FUNCTION padova.app_write_${table}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN\n IF TG_OP='INSERT' THEN\n INSERT INTO padova.${qi(b)} (${Object.keys(vals).map(qi).join(',')}) VALUES (${Object.values(vals).join(',')});\n ELSIF TG_OP='UPDATE' THEN\n ${updateSQL}\n ELSE RAISE EXCEPTION 'Adapter deletion is not permitted'; END IF; RETURN NEW; END $$;\nCREATE TRIGGER app_write INSTEAD OF INSERT OR UPDATE ON padova.app_${table} FOR EACH ROW EXECUTE FUNCTION padova.app_write_${table}();\n`;
}
// Supplemental primary keys/uniques. Existing constraints are never inferred/replaced here.
const keys = (
  await source.query(
    `SELECT c.relname AS name,con.conname,pg_get_constraintdef(con.oid,true) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype IN ('p','u')`,
  )
).rows;
for (const k of keys)
  if (manifest[k.name] && !manifest[k.name].existing)
    sql += `ALTER TABLE padova.${qi(manifest[k.name].base)} ADD CONSTRAINT ${qi('app_' + k.conname)} ${k.definition};\n`;
await mkdir('db/padova', { recursive: true });
await writeFile('db/padova/adapter-core.sql', sql);
await writeFile('src/lib/padova-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const fks = (
  await source.query(
    `SELECT c.relname AS name,con.conname,pg_get_constraintdef(con.oid,true) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype='f'`,
  )
).rows;
let integrity =
  '-- REVIEW ONLY. New-column/support-table integrity; never backfills existing data.\n';
const checks = (
  await source.query(
    `SELECT c.relname AS name,con.conname,pg_get_constraintdef(con.oid,true) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype='c' ORDER BY c.relname,con.conname`,
  )
).rows;
for (const c of checks)
  if (manifest[c.name] && !manifest[c.name].existing)
    integrity += `ALTER TABLE padova.${qi(manifest[c.name].base)} ADD CONSTRAINT ${qi('app_' + c.conname)} ${c.definition};\n`;
for (const fk of fks) {
  const m = manifest[fk.name];
  if (!m) continue;
  const match = fk.definition.match(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/);
  if (!match) continue;
  const field = match[1],
    target = match[2],
    targetField = match[3],
    dest = m.mapping[field];
  if (!dest) continue;
  if (m.existing && !dest.startsWith('app_')) continue;
  const paymentTarget: Record<string, string> = {
    payment_adjustments: 'receipts',
    asset_sale_receipts: 'receipts',
    asset_acquisition_payments: 'supplier_payments',
    referral_payments: 'supplier_payments',
  };
  if (target === 'payments' && !paymentTarget[fk.name])
    throw new Error('Explicit cash-ledger FK mapping required for ' + fk.name);
  const targetBase =
    target === 'payments'
      ? paymentTarget[fk.name]
      : target === 'commands'
        ? 'command_context'
        : target === 'refunds'
          ? 'supplier_refunds'
          : manifest[target]?.base;
  const targetCol =
    target === 'staff' ? 'user_id' : (manifest[target]?.mapping[targetField] ?? targetField);
  if (targetBase)
    integrity += `ALTER TABLE padova.${qi(m.base)} ADD CONSTRAINT ${qi('app_' + fk.conname)} FOREIGN KEY (${qi(dest)}) REFERENCES padova.${qi(targetBase)}(${qi(targetCol)}) DEFERRABLE INITIALLY DEFERRED;\n`;
}
for (const table of [
  'asset_lots',
  'asset_transfers',
  'asset_sale_receipts',
  'asset_acquisition_payments',
  'receipt_adjustments',
  'journal_lines',
  'security_audit',
  'attention_resolutions',
  'booking_payers',
  'command_context',
  'refund_movement_links',
  'traveler_status_events',
]) {
  integrity += `CREATE TRIGGER app_immutable BEFORE UPDATE OR DELETE ON padova.${qi(table)} FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();\nCREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.${qi(table)} FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();\n`;
}
await writeFile('db/padova/adapter-integrity.sql', integrity);
const mainTables = [
  ...new Set([
    ...Object.values(manifest).map((m: any) => m.base),
    'receipts',
    'receipt_allocations',
    'supplier_payments',
    'supplier_allocations',
    'requests',
    'supplier_refunds',
    'customer_refunds',
    'customer_refund_payments',
    'supplier_refund_receipts',
    'review_cases',
    'settings',
    'command_context',
    'refund_movement_links',
    'traveler_status_events',
  ]),
];
let grants =
  '-- REVIEW ONLY. Explicit server-only object privileges; no staging or test-schema grants.\n';
grants +=
  'GRANT SELECT ON padova.booking_summary,padova.customer_refund_status,padova.supplier_refund_status TO padova_app_server;\n';
for (const table of mainTables) {
  const readOnly = ['settings', 'review_cases', 'corporate_rules', 'app_schema_versions'].includes(
    table,
  );
  const mutable = [
    'staff',
    'parties',
    'party_relationships',
    'bookings',
    'booking_travelers',
    'tasks',
    'traveler_private',
    'payment_accounts',
    'web_sessions',
    'auth_throttles',
    'recovery_requests',
    'password_reset_tokens',
    'personal_recovery_codes',
  ].includes(table);
  grants += `ALTER TABLE padova.${qi(table)} ENABLE ROW LEVEL SECURITY;\nCREATE POLICY app_server ON padova.${qi(table)} TO padova_app_server USING(true) WITH CHECK(true);\nGRANT ${readOnly ? 'SELECT' : mutable ? 'SELECT,INSERT,UPDATE' : 'SELECT,INSERT'} ON padova.${qi(table)} TO padova_app_server;\n`;
  if (!old.some((c) => c.table_name === table))
    grants += `REVOKE ALL ON padova.${qi(table)} FROM PUBLIC,anon,authenticated,service_role;\n`;
}
for (const table of ['web_sessions', 'auth_throttles'])
  grants += `GRANT DELETE ON padova.${qi(table)} TO padova_app_server;\n`;
// PostgreSQL row locks require UPDATE privilege on at least one column.
// Existing append-only triggers still reject actual changes to these rows.
for (const table of ['assets', 'receipt_allocations', 'supplier_refunds'])
  grants += `GRANT UPDATE(id) ON padova.${qi(table)} TO padova_app_server;\n`;
for (const name of [
  ...tables.filter((t) => !native.has(t)),
  'payment_balances',
  'asset_balances',
  'booking_balances',
  'net_allocations',
])
  grants += `REVOKE ALL ON padova.app_${name} FROM PUBLIC,anon,authenticated,service_role;\nGRANT SELECT,INSERT,UPDATE ON padova.app_${name} TO padova_app_server;\n`;
grants += `GRANT USAGE ON SEQUENCE padova.app_booking_number TO padova_app_server;\nREVOKE ALL ON SEQUENCE padova.app_booking_number FROM PUBLIC,anon,authenticated,service_role;\n`;
// Restrict only newly generated app_* functions. Existing function bodies/privileges stay as reviewed.
const allFunctions = (
  sql +
  '\n' +
  (await readFile('db/padova/adapter-ledgers.sql', 'utf8')) +
  '\n' +
  (await readFile('db/padova/adapter-security.sql', 'utf8'))
).matchAll(/CREATE FUNCTION padova\.(app_\w+)\(([^)]*)\)/g);
for (const f of allFunctions) {
  const signature = f[2].trim()
    ? f[2]
        .split(',')
        .map((s) => s.trim().split(/\s+/).slice(1).join(' '))
        .join(',')
    : '';
  grants += `REVOKE ALL ON FUNCTION padova.${f[1]}(${signature}) FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION padova.${f[1]}(${signature}) TO padova_app_server;\n`;
}
grants += `INSERT INTO padova.app_schema_versions(version) VALUES('20261028_existing_padova_adapter');\n`;
await writeFile('db/padova/adapter-grants.sql', grants);
const installFiles = [
  'adapter-core',
  'adapter-ledgers',
  'adapter-security',
  'adapter-integrity',
  'adapter-grants',
];
const preflight = `-- OWNER REVIEW REQUIRED. Sole target: unugynfzmxjxifgofxjr, US Private Trial.\n-- Extends existing padova only. No staging/source import or data removal.\nBEGIN;\nSET LOCAL search_path=padova,pg_catalog;\nDO $$ BEGIN\n IF to_regclass('padova.staff') IS NULL OR to_regclass('padova_staging.evidence_records') IS NULL THEN RAISE EXCEPTION 'Expected existing Padova foundation is absent'; END IF;\n IF to_regclass('padova.app_schema_versions') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_app_server') THEN RAISE EXCEPTION 'Adapter objects already exist; inspect rather than overwrite'; END IF;\n IF (SELECT operational_entry_enabled FROM padova.settings WHERE id=true) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Expected existing operational lock; review before installation'; END IF;\nEND $$;\n`;
await writeFile(
  'db/padova/review-install.sql',
  preflight +
    (await Promise.all(installFiles.map((f) => readFile(`db/padova/${f}.sql`, 'utf8')))).join(
      '\n',
    ) +
    '\nCOMMIT;\n',
);
const body = (
  await Promise.all(installFiles.map((f) => readFile(`db/padova/${f}.sql`, 'utf8')))
).join('\n');
await writeFile(
  'db/padova/object-summary.json',
  JSON.stringify(
    {
      project: 'unugynfzmxjxifgofxjr',
      schema: 'padova',
      status: 'INSTALLED',
      installedMigration: '20261028191100_padova_existing_schema_adapter',
      adapterVersion: '20261028_existing_padova_adapter',
      appliedAt: '2026-10-28T19:11:00.661939Z',
      newTables: [...body.matchAll(/CREATE TABLE padova\."?(\w+)"?/g)].map((m) => m[1]),
      addedColumns: [
        ...body.matchAll(/ALTER TABLE padova\."?(\w+)"? ADD COLUMN "?(\w+)"? ([^;]+);/g),
      ].map((m) => ({ table: m[1], column: m[2], type: m[3] })),
      newViews: [...body.matchAll(/CREATE VIEW padova\.(\w+)/g)].map((m) => m[1]),
      newFunctions: [...body.matchAll(/CREATE FUNCTION padova\.(\w+)\(([^)]*)\)/g)].map((m) => ({
        name: m[1],
        arguments: m[2],
      })),
      newPolicies: [...body.matchAll(/CREATE POLICY app_server ON padova\."?(\w+)"?/g)].map(
        (m) => ({ table: m[1], role: 'padova_app_server' }),
      ),
      constraintChanges: [
        'Replace parties_kind_check with broader allowed party types',
        'Replace receipts_kind_check to add supplier_refund',
        'Allow nullable supplier_refunds.funding_id for booking-wide cases',
      ],
      existingRPCExecutionRevokes: [
        'public.padova_activate_owner()',
        'public.padova_booking_detail(uuid)',
        'public.padova_command(text,jsonb,uuid)',
        'public.padova_historical_bookings(text,integer)',
        'public.padova_historical_directory(text,integer)',
        'public.padova_manage_staff(text,boolean)',
        'public.padova_read(text,text,integer)',
        'public.padova_references()',
        'padova.booking_detail(uuid)',
        'padova.command(text,jsonb,uuid)',
        'padova.manage_staff(text,boolean)',
        'padova.read_data(text,text,integer)',
      ],
      stagingChanges: [],
      testSchemaChanges: [],
      dataBackfills: [],
      dataRemovals: [],
    },
    null,
    2,
  ) + '\n',
);
await source.close();
await legacy.close();
console.log('Prepared local review SQL and relation manifest; no cloud connection used.');
