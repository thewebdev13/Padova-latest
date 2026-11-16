import { readFile, writeFile } from 'node:fs/promises';
const destination = 'supabase/migrations/20261104210123_partnership_sales_crm.sql';
const local = (
  await Promise.all(
    ['021_partnerships', '022_partnership_refresh'].map((v) => readFile(`db/${v}.sql`, 'utf8')),
  )
).join('\n');
const tables = [...local.matchAll(/CREATE TABLE (pt_\w+) /g)].map((m) => m[1]);
const immutable = [
  'pt_import_batches',
  'pt_source_items',
  'pt_source_resolutions',
  'pt_interactions',
  'pt_research',
  'pt_agreements',
  'pt_referrals',
  'pt_documents',
  'pt_commands',
  'pt_audit',
];
const header = `-- PREPARED ONLY. Additive Partnerships extension of the installed US padova foundation.
-- No source/financial backfill, adapter reinstall, schema/project creation or gate changes.
-- Apply only after explicit production cutover approval, fresh backup/restore and latest-main acceptance.
BEGIN;
SET LOCAL search_path=padova,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter') THEN RAISE EXCEPTION 'Existing adapter required; never reinstall it'; END IF;
 IF NOT EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261101_commission_payables') THEN RAISE EXCEPTION 'Existing commission payable extension required'; END IF;
 IF EXISTS(SELECT 1 FROM padova.app_schema_versions WHERE version='20261104_partnership_sales_crm') THEN RAISE EXCEPTION 'Partnership extension already installed; do not reinstall'; END IF;
END $$;
`;
const body = local
  .replace(/^--.*\r?\n/, '')
  .replaceAll('REFERENCES staff(id)', 'REFERENCES padova.staff(user_id)')
  .replaceAll('REFERENCES parties(id)', 'REFERENCES padova.parties(id)')
  .replaceAll('REFERENCES bookings(id)', 'REFERENCES padova.bookings(id)')
  .replaceAll('REFERENCES referrals(id)', 'REFERENCES padova.referral_terms(id)')
  .replace(/INSERT INTO schema_migrations\(version\) VALUES\('02[12]_[a-z_]+'\);/g, '');
const grants = tables
  .map(
    (t) => `REVOKE ALL ON padova.${t} FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.${t} TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT${immutable.includes(t) ? '' : ',UPDATE'} ON padova.${t} TO padova_app_server;
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.${t} FOR EACH STATEMENT EXECUTE FUNCTION padova.pt_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.${t} TO padova_backup; END IF; END $$;`,
  )
  .join('\n');
const sql =
  header +
  body +
  '\n' +
  grants +
  "\nREVOKE ALL ON FUNCTION padova.pt_immutable() FROM PUBLIC,anon,authenticated,service_role;\nINSERT INTO padova.app_schema_versions(version) VALUES('20261104_partnership_sales_crm');\nCOMMIT;\n";
await writeFile(destination, sql);
await writeFile('db/padova/partnerships.sql', sql);
console.log(
  `Prepared ${tables.length} private tables; no database connection made. ${destination}`,
);
