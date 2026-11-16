import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('supabase/migrations')).filter((f) =>
  f.endsWith('_final_entry_integrity.sql'),
);
if (files.length !== 1)
  throw new Error(
    'Create exactly one incremental file with supabase migration new final_entry_integrity',
  );
const local = await readFile('db/016_final_entry_integrity.sql', 'utf8');
let sql = local.slice(0, local.indexOf('DO $$'));
for (const name of [
  'payment_accounts',
  'parties',
  'obligation_settlements',
  'supplier_obligations',
  'review_resolution_events',
])
  sql = sql.replace(new RegExp(`\\b(TABLE|REFERENCES|ON) ${name}\\b`, 'g'), `$1 padova.${name}`);
sql = sql
  .replaceAll('REFERENCES payment_allocations(id)', 'REFERENCES padova.supplier_allocations(id)')
  .replaceAll(
    'REFERENCES commands(id)',
    'REFERENCES padova.command_context(id) DEFERRABLE INITIALLY DEFERRED',
  );
for (const name of ['obligation_settlements', 'review_resolution_events'])
  sql += `\nALTER TABLE padova.${name} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON padova.${name} FROM PUBLIC,anon,authenticated,service_role;\nCREATE POLICY app_server ON padova.${name} TO padova_app_server USING(true) WITH CHECK(true);\nGRANT SELECT,INSERT ON padova.${name} TO padova_app_server;\nCREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON padova.${name} FOR EACH ROW EXECUTE FUNCTION padova.reject_mutation();\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.${name} TO padova_backup; END IF; END $$;\n`;
let guard = (await readFile('db/017_obligation_settlement_guard.sql', 'utf8')).split(
  'INSERT INTO schema_migrations',
)[0];
for (const [name, target] of Object.entries({
  supplier_obligations: 'app_supplier_obligations',
  payment_allocations: 'app_payment_allocations',
  payments: 'app_payments',
  net_allocations: 'app_net_allocations',
  obligation_settlements: 'obligation_settlements',
}))
  guard = guard.replace(new RegExp(`\\b(FROM|JOIN|ON) ${name}\\b`, 'g'), `$1 padova.${target}`);
guard = guard
  .replaceAll(
    'FUNCTION validate_obligation_settlement()',
    'FUNCTION padova.validate_obligation_settlement()',
  )
  .replace('LANGUAGE plpgsql AS', "LANGUAGE plpgsql SET search_path='' AS");
sql +=
  guard +
  (await readFile('db/padova/financial-import-binding.sql', 'utf8')) +
  "\nINSERT INTO padova.app_schema_versions(version) VALUES('20261030_final_entry_integrity');\n";
await writeFile(
  `supabase/migrations/${files[0]}`,
  '-- PREPARED ONLY. No historical posting, backfill, source changes or gate changes.\n' + sql,
);
await writeFile(
  'db/padova/final-entry-summary.json',
  JSON.stringify(
    {
      project: 'unugynfzmxjxifgofxjr',
      schema: 'padova',
      migration: `supabase/migrations/${files[0]}`,
      sha256: createHash('sha256')
        .update(
          '-- PREPARED ONLY. No historical posting, backfill, source changes or gate changes.\n' +
            sql,
        )
        .digest('hex'),
      installed: false,
      historicalFinancialPostingAuthorized: false,
      scope: [
        'payment account eligibility',
        'exact seller obligation allocation',
        'immutable source review decisions',
        'default-disabled reviewed financial import binding to existing staging mappings',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('Prepared additive US extension; not connected or installed.');
