import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('supabase/migrations')).filter((f) =>
  f.endsWith('_v1_source_profiles.sql'),
);
if (files.length !== 1)
  throw new Error('Create one local file using supabase migration new v1_source_profiles');
let sql = (await readFile('db/018_v1_source_profiles.sql', 'utf8')).split('DO $$')[0];
for (const name of [
  'booking_source_profiles',
  'source_profile_assets',
  'booking_source_methods',
  'assets',
  'parties',
])
  sql = sql.replace(new RegExp(`\\b(TABLE|REFERENCES|ON) ${name}\\b`, 'g'), `$1 padova.${name}`);
sql = sql.replaceAll('FUNCTION prevent_history_change()', 'FUNCTION padova.reject_mutation()');
sql = sql.replaceAll(',source_profile_assets', ',padova.source_profile_assets');
for (const name of ['booking_source_profiles', 'source_profile_assets']) {
  sql += `\nALTER TABLE padova.${name} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padova.${name} FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY app_server ON padova.${name} TO padova_app_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON padova.${name} TO padova_app_server;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='padova_backup') THEN GRANT SELECT ON padova.${name} TO padova_backup; END IF; END $$;\n`;
}
sql =
  '-- PREPARED ONLY. Existing adapter and booking-entry extensions required. No backfill, posting, source or gate changes.\n' +
  sql +
  "\nINSERT INTO padova.app_schema_versions(version) VALUES('20261030_v1_source_profiles');\n";
await writeFile(`supabase/migrations/${files[0]}`, sql);
await writeFile(
  'db/padova/v1-master-summary.json',
  JSON.stringify(
    {
      project: 'unugynfzmxjxifgofxjr',
      schema: 'padova',
      installed: false,
      migration: `supabase/migrations/${files[0]}`,
      sha256: createHash('sha256').update(sql).digest('hex'),
      historicalFinancialPostingAuthorized: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('Prepared local US extension; no connection or installation.');
