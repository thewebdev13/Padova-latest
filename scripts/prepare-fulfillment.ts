// Prepare a distinct incremental review file. Never regenerate the installed adapter.
import { readFile, writeFile } from 'node:fs/promises';
try {
  const manifest = JSON.parse(await readFile('db/padova/fulfillment-object-summary.json', 'utf8'));
  if (manifest.status === 'INSTALLED')
    throw new Error(
      'Fulfillment extension is already installed. Do not regenerate or reinstall; prepare a separate incremental migration.',
    );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const target = 'supabase/migrations/20261029012515_padova_fulfillment_catalogs_units.sql';
const original = await readFile('db/padova/adapter-core.sql', 'utf8');
let sql = `-- Incremental unit/catalog extension; consult docs/FULFILLMENT_ARCHITECTURE.md for installation status.
-- Additive catalogs/component metadata; nullable units, no data backfill or staging access.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter') THEN RAISE EXCEPTION 'The existing installed adapter is required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261029_fulfillment_catalogs_units') THEN RAISE EXCEPTION 'Fulfillment extension is already installed; do not reinstall'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('app_write_assets','21be28ebdf6d59a7185d2224bc53c6d4'),('app_write_funding_components','0ea933d8062d588a668c7cd528e6ca1c'),('app_write_asset_movements','9b20d62e794f5a3e81e93a37c8626274'),('app_write_refund','d48509abb886a19982392c9183131d8d')) expected(name,hash)
 LEFT JOIN pg_proc p ON p.proname=expected.name AND p.pronamespace='padova'::regnamespace AND p.pronargs=0 WHERE p.oid IS NULL OR md5(p.prosrc)<>expected.hash) THEN RAISE EXCEPTION 'Installed adapter changed; inspect before extending it'; END IF;
END $$;
ALTER TABLE padova.assets ADD COLUMN app_unit text CHECK(app_unit IN ('money','points','count'));
ALTER TABLE padova.funding_components ADD COLUMN app_unit text CHECK(app_unit IN ('money','points','count'));
ALTER TABLE padova.supplier_refunds ADD COLUMN app_quantity_unit text CHECK(app_quantity_unit IN ('money','points','count'));
`;
for (const name of ['assets', 'funding_components']) {
  const line = original.split('\n').find((l) => l.startsWith(`CREATE VIEW padova.app_${name} `))!;
  let view = line.replace('CREATE VIEW', 'CREATE OR REPLACE VIEW');
  view = view.replace(
    "b.kind='points'",
    "COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END)<>'money'",
  );
  view = view.replace(
    ` FROM padova."${name}" b;`,
    `,COALESCE(b.app_unit,CASE WHEN b.kind='points' THEN 'points' ELSE 'money' END) AS unit FROM padova."${name}" b;`,
  );
  sql += view + '\n';
  const start = original.indexOf(`CREATE FUNCTION padova.app_write_${name}()`);
  let fn = original
    .slice(start, original.indexOf('END $$;', start) + 7)
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
  const inferred =
    "COALESCE(NEW.unit,CASE WHEN NEW.kind ~* 'point|mile' THEN 'points' ELSE 'money' END)";
  fn = fn.replaceAll(
    "CASE WHEN NEW.kind ~* 'point|mile' THEN 'points'",
    `CASE WHEN ${inferred}='points' THEN 'points'`,
  );
  const quantityField = name === 'assets' ? 'opening_quantity' : 'face_amount';
  fn = fn.replaceAll(
    `CASE WHEN NEW.kind ~* 'point|mile' THEN NEW.${quantityField}`,
    `CASE WHEN ${inferred}<>'money' THEN NEW.${quantityField}`,
  );
  fn = fn.replace('"app_kind",', '"app_kind","app_unit",');
  if (name === 'assets') {
    fn = fn.replace("NEW.kind,'owner_confirmed'", `NEW.kind,${inferred},'owner_confirmed'`);
  } else {
    fn = fn.replace('"app_kind")', '"app_kind","app_unit")');
    fn = fn.replace('NEW.kind);', `NEW.kind,${inferred});`);
  }
  fn = fn.replace('"app_kind"=NEW.kind', `"app_unit"=${inferred},"app_kind"=NEW.kind`);
  sql += fn + '\n';
}
const movementStart = original.indexOf('CREATE FUNCTION padova.app_write_asset_movements()');
sql +=
  original
    .slice(movementStart, original.indexOf('END $$;', movementStart) + 7)
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replaceAll(
      "(SELECT kind FROM padova.assets WHERE id=NEW.asset_id)='points'",
      "(SELECT COALESCE(app_unit,CASE WHEN kind='points' THEN 'points' ELSE 'money' END) FROM padova.assets WHERE id=NEW.asset_id)<>'money'",
    ) + '\n';
sql += `CREATE OR REPLACE VIEW padova.app_asset_balances WITH(security_invoker=true) AS
 SELECT a.id,a.name,a.kind,a.issuer,a.holder_id,a.seller_id,a.source_booking_id,a.ownership,a.expires_on,a.restrictions,a.reference,a.created_at,a.opening_quantity,a.opening_cost,
 COALESCE((SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS balance,
 COALESCE((SELECT sum(basis) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint AS remaining_basis,a.unit FROM padova.app_assets a;
`;
const ledgers = await readFile('db/padova/adapter-ledgers.sql', 'utf8');
const refundViewStart = ledgers.indexOf('CREATE VIEW padova.app_refunds ');
sql +=
  ledgers
    .slice(refundViewStart, ledgers.indexOf(';', refundViewStart) + 1)
    .replace('CREATE VIEW', 'CREATE OR REPLACE VIEW')
    .replace(
      's.app_command_id AS command_id',
      's.app_command_id AS command_id,s.app_quantity_unit AS quantity_unit',
    ) + '\n';
const refundWriteStart = ledgers.indexOf('CREATE FUNCTION padova.app_write_refund()');
sql +=
  ledgers
    .slice(refundWriteStart, ledgers.indexOf('END $$;', refundWriteStart) + 7)
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace('app_reason,app_command_id)', 'app_reason,app_command_id,app_quantity_unit)')
    .replace('NEW.reason,NEW.command_id);', 'NEW.reason,NEW.command_id,NEW.quantity_unit);') + '\n';
const names = [
  'programs',
  'instruments',
  'program_accounts',
  'travel_components',
  'inventory_profiles',
  'fulfillment_details',
  'funding_asset_uses',
  'expected_events',
  'expected_event_updates',
];
let tables = (await readFile('db/011_fulfillment_catalogs.sql', 'utf8'))
  .split('CREATE TABLE programs')[1]
  .split('DO $$')[0];
tables = 'CREATE TABLE programs' + tables;
for (const name of [
  ...names,
  'parties',
  'bookings',
  'assets',
  'funding_components',
  'asset_movements',
]) {
  tables = tables.replace(
    new RegExp(`\\b(CREATE TABLE|REFERENCES|ON) ${name}\\b`, 'g'),
    `$1 padova.${name}`,
  );
}
tables = tables.replaceAll(
  'REFERENCES commands(id)',
  'REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED',
);
sql += tables;
for (const name of names)
  sql += `
ALTER TABLE padova.${name} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.${name} FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.${name} TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.${name} TO padova_app_server;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.${name} FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();
`;
sql += `\nDO $$ DECLARE relation_name text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN
  FOREACH relation_name IN ARRAY ARRAY[${names.map((name) => `'${name}'`).join(',')}] LOOP
   EXECUTE format('GRANT SELECT ON padova.%I TO padova_backup',relation_name);
  END LOOP;
 END IF;
END $$;\n`;
sql +=
  "\nINSERT INTO padova.app_schema_versions(version) VALUES('20261029_fulfillment_catalogs_units');\n";
await writeFile(target, sql);
console.log('Prepared incremental fulfillment SQL locally; no database connection or application.');
