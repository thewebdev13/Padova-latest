import path from 'node:path';
import { existsSync } from 'node:fs';
import { configuredDatabaseURL, PADOVA_PROJECT } from './project';

// Renewable sign-in proofs and plaintext provider/MFA secrets are not backup-reader data.
export const PRIVATE_AUTH_TABLES = [
  'users',
  'sessions',
  'refresh_tokens',
  'flow_state',
  'mfa_factors',
  'mfa_challenges',
  'saml_relay_states',
  'one_time_tokens',
  'oauth_authorizations',
  'oauth_client_states',
  'webauthn_challenges',
  'custom_oauth_providers',
] as const;
export const PRIVATE_USER_COLUMNS = [
  'confirmation_token',
  'recovery_token',
  'email_change_token_new',
  'phone_change_token',
  'email_change_token_current',
  'reauthentication_token',
] as const;

/** libpq does not expand connection URIs from PGDATABASE; pass separate private env fields. */
export function backupDatabaseEnvironment(
  env: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  if (!env.PADOVA_BACKUP_DATABASE_URL)
    throw new Error(
      'Configure the dedicated PADOVA_BACKUP_DATABASE_URL; the web login is not a backup credential',
    );
  const url = new URL(
    configuredDatabaseURL({ ...env, DATABASE_URL: env.PADOVA_BACKUP_DATABASE_URL })!,
  );
  if (
    decodeURIComponent(url.username) !== `padova_backup.${PADOVA_PROJECT.ref}` &&
    !(url.hostname === `db.${PADOVA_PROJECT.ref}.supabase.co` && url.username === 'padova_backup')
  )
    throw new Error('Use the dedicated padova_backup login');
  return {
    ...env,
    NODE_ENV:
      env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? env.NODE_ENV : 'production',
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: 'postgres',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: url.searchParams.get('sslrootcert') ?? undefined,
    PGAPPNAME: 'padova-independent-backup',
    PGOPTIONS: '-c default_transaction_read_only=on',
  };
}

export function postgresTool(name: string) {
  const directory = process.env.PADOVA_PG_BIN ?? path.resolve('.data/postgresql-tools/pgsql/bin');
  const executable = path.join(directory, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  return existsSync(executable) ? executable : name;
}

export function databaseDumpArguments() {
  return [
    '--format=custom',
    '--no-owner',
    '--no-large-objects',
    ...[
      'padova',
      'padova_staging',
      'padova_test_20261027',
      'padova_test_20261027_auth',
      'padova_test_20261027_staging',
      'public',
      'supabase_migrations',
    ].map((schema) => `--schema=${schema}`),
  ];
}
