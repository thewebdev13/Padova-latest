// Emits schema only for the separately authorized EMPTY synthetic QA project.
// Never execute against an existing installation or the production foundation.
import { readFile } from 'node:fs/promises';
import { PADOVA_QA_PROJECT } from '../src/lib/project';

export async function cloudQASchema() {
  const snapshot = await readFile('tests/fixtures/existing-padova.sql', 'utf8');
  // Exclude the local fixture's fake Auth schema/roles: hosted QA uses real Supabase Auth.
  const base = snapshot.slice(snapshot.indexOf('CREATE SCHEMA padova;'));
  const parts = [
    `DO $$ BEGIN
      IF current_database() <> 'postgres' OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='padova')
      THEN RAISE EXCEPTION 'QA bootstrap requires an empty new database'; END IF;
    END $$;`,
    base,
    'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA padova FROM PUBLIC,anon,authenticated;',
    'REVOKE ALL ON ALL TABLES IN SCHEMA padova,padova_staging FROM PUBLIC,anon,authenticated;',
    'REVOKE ALL ON SCHEMA padova_staging FROM PUBLIC,anon,authenticated;',
  ];
  for (const name of ['core', 'ledgers', 'security', 'integrity', 'grants'])
    parts.push(await readFile(`db/padova/adapter-${name}.sql`, 'utf8'));
  for (const name of [
    '20261029012515_padova_fulfillment_catalogs_units',
    '20261029131534_padova_owned_reward_reversal_positions',
    '20261029195159_padova_booking_entry',
    '20261029225428_final_entry_integrity',
    '20261030125035_v1_source_profiles',
    '20261101193320_commission_payables',
    '20261101221513_targeted_entry_reliability',
  ])
    parts.push(await readFile(`supabase/migrations/${name}.sql`, 'utf8'));
  parts.push(`
    CREATE TABLE padova.qa_environment (
      id boolean PRIMARY KEY DEFAULT true CHECK(id),
      project_ref text NOT NULL CHECK(project_ref='${PADOVA_QA_PROJECT.ref}'),
      data_class text NOT NULL CHECK(data_class='synthetic')
    );
    INSERT INTO padova.qa_environment VALUES(true,'${PADOVA_QA_PROJECT.ref}','synthetic');
    ALTER TABLE padova.qa_environment ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON padova.qa_environment TO padova_app_server;
    CREATE POLICY qa_environment_read ON padova.qa_environment FOR SELECT TO padova_app_server USING(true);
    CREATE TABLE padova.qa_issues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id uuid NOT NULL REFERENCES auth.users(id),
      reporter_name text NOT NULL,
      type text NOT NULL CHECK(type IN ('Bug','Confusing','Missing','Too Slow','Suggestion')),
      section text NOT NULL, booking text NOT NULL DEFAULT '',
      expected text NOT NULL, happened text NOT NULL, notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE padova.qa_issues ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT ON padova.qa_issues TO padova_app_server;
    CREATE POLICY qa_issue_server_read ON padova.qa_issues FOR SELECT TO padova_app_server USING(true);
    CREATE POLICY qa_issue_server_insert ON padova.qa_issues FOR INSERT TO padova_app_server WITH CHECK(true);
    REVOKE ALL ON padova.qa_environment,padova.qa_issues FROM PUBLIC,anon,authenticated,service_role;
    DO $$ DECLARE f record; BEGIN
      FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'padova_%'
      LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated', f.signature); END LOOP;
    END $$;
  `);
  // PostgreSQL stores function bodies verbatim; reviewed migration hashes use LF.
  return parts.join('\n').replace(/\r\n/g, '\n');
}

if (process.argv.includes('--emit-schema')) process.stdout.write(await cloudQASchema());
