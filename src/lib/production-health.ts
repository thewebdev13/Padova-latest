import { configuredDatabaseURL, PADOVA_PROJECT } from './project';

// A fixed read of an installed, non-financial marker. No caller-supplied SQL or
// parameters, financial tables, staff sessions, migrations or writes are used.
export const productionHealthRead =
  "SELECT statement_timestamp() AS checked_at FROM padova.app_schema_versions WHERE version='20261028_existing_padova_adapter'";

export async function productionHealth(
  env: Record<string, string | undefined>,
  read: () => Promise<{ rows: { checked_at: unknown }[] }>,
) {
  try {
    // Fail before constructing a connection when this is QA, local, or miswired.
    if (
      env.PADOVA_DATABASE_MODE !== 'supabase' ||
      env.PADOVA_QA !== '0' ||
      env.PADOVA_QA_PROJECT_REF ||
      env.SUPABASE_URL !== PADOVA_PROJECT.url ||
      !configuredDatabaseURL(env)
    )
      throw new Error('Production identity required');
  } catch {
    return {
      status: 'unhealthy',
      application: 'reachable',
      database: 'not_checked',
    } as const;
  }
  try {
    const result = await read();
    const checkedAt = result.rows[0]?.checked_at;
    const timestamp = checkedAt instanceof Date ? checkedAt.toISOString() : checkedAt;
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)))
      throw new Error('Installed marker missing');
    return {
      status: 'healthy',
      application: 'reachable',
      database: 'reachable',
      projectRef: PADOVA_PROJECT.ref,
      checkedAt: timestamp,
    } as const;
  } catch {
    // Never return/log connection strings, database errors, credentials or rows.
    return {
      status: 'unhealthy',
      application: 'reachable',
      database: 'unavailable',
      projectRef: PADOVA_PROJECT.ref,
    } as const;
  }
}
