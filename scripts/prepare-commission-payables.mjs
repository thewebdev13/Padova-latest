import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('supabase/migrations')).filter((f) =>
  f.endsWith('_commission_payables.sql'),
);
if (files.length !== 1)
  throw new Error(
    'Create exactly one local migration using supabase migration new commission_payables',
  );
let sql = (await readFile('db/019_commission_payables.sql', 'utf8')).split(
  '-- Local fixture roles',
)[0];
sql = sql.replace(
  'ALTER TABLE referrals DROP CONSTRAINT referrals_booking_id_key;',
  'ALTER TABLE padova.referral_terms DROP CONSTRAINT referral_terms_booking_id_key;',
);
sql = sql
  .replaceAll('REFERENCES referrals(id)', 'REFERENCES padova.referral_terms(id)')
  .replaceAll('REFERENCES commands(id)', 'REFERENCES padova.command_context(id)');
sql = sql.replace(
  /\b(TABLE|ON) (commission_payable_revisions|commission_payout_adjustments)\b/g,
  '$1 padova.$2',
);
sql = sql.replaceAll('REFERENCES payments(id)', 'REFERENCES padova.supplier_payments(id)');
sql = sql.replace('ON referrals(booking_id)', 'ON padova.referral_terms(booking_id)');
sql = sql.replace('ON commission_payable_revisions(', 'ON padova.commission_payable_revisions(');
sql = sql.replace('ON commission_payable_revisions ', 'ON padova.commission_payable_revisions ');
sql = sql.replaceAll('FUNCTION prevent_history_change()', 'FUNCTION padova.reject_mutation()');
const adapter = await readFile('db/padova/adapter-ledgers.sql', 'utf8');
const balances = adapter.match(/CREATE VIEW padova\.app_payment_balances[^;]+;/)?.[0];
if (!balances) throw new Error('Installed adapter payment balance definition missing');
sql = sql.replace(
  /CREATE OR REPLACE VIEW payment_balances[^;]+;/,
  balances
    .replace('CREATE VIEW', 'CREATE OR REPLACE VIEW')
    .replace(
      ' AS current_amount',
      '+COALESCE((SELECT sum(delta) FROM padova.commission_payout_adjustments a WHERE a.payment_id=p.id),0)::bigint AS current_amount',
    ),
);
sql = sql.replace("INSERT INTO schema_migrations(version) VALUES('019_commission_payables');", '');
sql =
  '-- PREPARED ONLY. Reuse installed US adapter; no backfill, historical posting, authentication or gate changes.\n' +
  sql +
  `
REVOKE ALL ON padova.commission_payable_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.commission_payable_revisions TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.commission_payable_revisions TO padova_app_server;
REVOKE ALL ON padova.commission_payout_adjustments FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.commission_payout_adjustments TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.commission_payout_adjustments TO padova_app_server;
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.commission_payable_revisions FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
CREATE TRIGGER app_no_truncate BEFORE TRUNCATE ON padova.commission_payout_adjustments FOR EACH STATEMENT EXECUTE FUNCTION padova.reject_mutation();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.commission_payable_revisions TO padova_backup; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.commission_payout_adjustments TO padova_backup; END IF; END $$;
INSERT INTO padova.app_schema_versions(version) VALUES('20261101_commission_payables');
`;
const migration = 'supabase/migrations/' + files[0];
await writeFile(migration, sql);
await writeFile(
  'db/padova/commission-payables-summary.json',
  JSON.stringify(
    {
      project: 'unugynfzmxjxifgofxjr',
      schema: 'padova',
      installed: false,
      migration,
      sha256: createHash('sha256').update(sql).digest('hex'),
      historicalFinancialPostingAuthorized: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Prepared the additive existing-schema Commission Payable extension; no database connection.',
);
