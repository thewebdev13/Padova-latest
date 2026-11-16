import { Client } from 'pg';
import { configuredDatabaseURL } from './project';

export async function connectionDiagnostics(env: Record<string, string | undefined> = process.env) {
  const connectionString = configuredDatabaseURL(env);
  if (!connectionString) throw new Error('Configure the pinned US database connection');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    application_name: 'padova-readonly-diagnostics',
  });
  try {
    await client.connect();
    const stream = (
      client as unknown as {
        connection: {
          stream: { encrypted?: boolean; authorized?: boolean; getProtocol?: () => string };
        };
      }
    ).connection.stream;
    if (!stream.encrypted || !stream.authorized)
      throw new Error('Client TLS verification did not succeed');
    const tls = {
      encrypted: true,
      certificateVerified: true,
      protocol: stream.getProtocol?.() ?? null,
    };
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE padova_app_server');
    const result = (
      await client.query(`SELECT current_user runtime_role,session_user login_role,current_setting('transaction_read_only') read_only,
      has_schema_privilege(current_user,'padova_staging','USAGE') staging_access,
      (SELECT count(*)::integer FROM padova.review_cases) review_cases,
      (SELECT count(*)::integer FROM padova.staff) staff_count,
      (SELECT operational_entry_enabled FROM padova.settings WHERE id=true) operational_entry_enabled,
      to_regclass('padova.app_schema_versions') IS NOT NULL adapter_installed`)
    ).rows[0];
    await client.query('ROLLBACK');
    return { tls, ...result };
  } catch (error: any) {
    throw new Error(
      `Read-only connection verification failed (${error.code ?? 'connection error'}); no credentials are printed`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}
