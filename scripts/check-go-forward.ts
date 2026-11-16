import { createDatabase, requireCurrentSchema } from '../src/lib/db';
import { PADOVA_PROJECT } from '../src/lib/project';

// Read-only deployment preflight. Never unlocks entry or installs migrations.
if (process.env.PADOVA_DATABASE_MODE !== 'supabase' || !process.env.DATABASE_URL)
  throw new Error('Explicit existing US Supabase configuration is required; no local fallback');
const required = [
  '20261028_existing_padova_adapter',
  '20261029_fulfillment_catalogs_units',
  '20261029_owned_reward_reversal_positions',
  '20261029_booking_entry',
  '20261030_final_entry_integrity',
  '20261030_v1_source_profiles',
  '20261101_commission_payables',
  '20261102_targeted_entry_reliability',
];
const db = await createDatabase();
try {
  await requireCurrentSchema(db);
  const result = await db.transaction(async (tx) => {
    const versions = new Set(
      (await tx.query('SELECT version FROM padova.app_schema_versions')).rows.map((r) => r.version),
    );
    const missing = required.filter((v) => !versions.has(v));
    const settings = (
      await tx.query(
        'SELECT operational_entry_enabled,backup_verified_at FROM padova.settings WHERE id=true',
      )
    ).rows[0];
    const role = (
      await tx.query(
        "SELECT current_user runtime_role,has_schema_privilege(current_user,'padova_staging','USAGE') staging_access,has_table_privilege(current_user,'padova.settings','UPDATE') settings_write",
      )
    ).rows[0];
    const tables = (
      await tx.query(
        "SELECT to_regclass('padova.commission_payable_revisions') IS NOT NULL terms_present,to_regclass('padova.commission_payout_adjustments') IS NOT NULL corrections_present",
      )
    ).rows[0];
    return { missing, settings, role, tables };
  });
  const blockers: string[] = [];
  if (result.missing.length)
    blockers.push('Missing prepared extensions: ' + result.missing.join(', '));
  if (!result.tables.terms_present || !result.tables.corrections_present)
    blockers.push('Commission Payable relations missing');
  if (
    result.role.runtime_role !== 'padova_app_server' ||
    result.role.staging_access ||
    result.role.settings_write
  )
    blockers.push('Runtime permission isolation failed');
  if (!result.settings?.backup_verified_at)
    blockers.push('Independent backup/restore verification not recorded');
  if (!result.settings?.operational_entry_enabled)
    blockers.push('Operational entry gate remains locked');
  console.log(
    JSON.stringify(
      {
        project: PADOVA_PROJECT.ref,
        readOnly: true,
        ...result,
        blockers,
        hostedAcceptance:
          'Must be independently verified on the established deployment; this database preflight does not certify hosting.',
      },
      null,
      2,
    ),
  );
  if (blockers.length) process.exitCode = 1;
} finally {
  await db.close();
}
