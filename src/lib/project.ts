// Permanent cloud target, selected by the Owner. Never substitute another project.
export const PADOVA_PROJECT = {
  name: 'Padova Travel - US Private Trial',
  ref: 'unugynfzmxjxifgofxjr',
  region: 'us-east-1',
  url: 'https://unugynfzmxjxifgofxjr.supabase.co',
  schema: 'padova',
} as const;

// Dedicated synthetic beta, separately authorized by the Owner. Never a fallback
// for production and never selected without both explicit QA settings.
export const PADOVA_QA_PROJECT = {
  name: 'Padova QA - Synthetic Beta',
  ref: 'cnpyvmhgbtyleckyirye',
  region: 'us-east-1',
  url: 'https://cnpyvmhgbtyleckyirye.supabase.co',
  schema: 'padova',
} as const;

export function selectedSupabaseProject(env: Record<string, string | undefined> = process.env) {
  if (env.PADOVA_QA === '1' && env.PADOVA_DATABASE_MODE === 'supabase') {
    if (env.PADOVA_QA_PROJECT_REF !== PADOVA_QA_PROJECT.ref)
      throw new Error('Hosted QA requires its separately pinned synthetic project');
    return PADOVA_QA_PROJECT;
  }
  if (env.PADOVA_QA_PROJECT_REF)
    throw new Error('QA project reference requires explicit hosted QA mode');
  return PADOVA_PROJECT;
}

/** Secure defaults in memory; never rewrites the user's private environment file. */
export function configuredDatabaseURL(env: Record<string, string | undefined> = process.env) {
  if (!env.DATABASE_URL) {
    validateDatabaseTarget(env);
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'verify-full');
  if (env.PADOVA_DB_CA_FILE && !url.searchParams.has('sslrootcert'))
    url.searchParams.set('sslrootcert', env.PADOVA_DB_CA_FILE);
  const value = url.toString();
  validateDatabaseTarget({ ...env, DATABASE_URL: value });
  return value;
}

export function validateDatabaseTarget(env: Record<string, string | undefined> = process.env) {
  const project = selectedSupabaseProject(env);
  const mode = env.PADOVA_DATABASE_MODE;
  if (mode && mode !== 'local' && mode !== 'supabase')
    throw new Error('PADOVA_DATABASE_MODE must be local or supabase');
  if (!env.DATABASE_URL) {
    if (mode === 'supabase')
      throw new Error('US Supabase DATABASE_URL is required; local fallback is disabled');
    return;
  }
  if (mode === 'local') throw new Error('Local mode cannot use a cloud DATABASE_URL');
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  const direct = url.hostname === `db.${project.ref}.supabase.co`;
  const pooler =
    /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username).endsWith(`.${project.ref}`);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooler))
    throw new Error(`Cloud database must be ${project.name} (${project.ref})`);
  if (
    project.ref === PADOVA_QA_PROJECT.ref &&
    !['padova_qa_runtime', `padova_qa_runtime.${project.ref}`].includes(
      decodeURIComponent(url.username),
    )
  )
    throw new Error('Hosted QA requires its restricted QA runtime database login');
  if (url.pathname !== '/postgres' || !url.password)
    throw new Error('DATABASE_URL requires the postgres database and a private password');
  if (url.port && url.port !== '5432')
    throw new Error(
      'Use Direct or Session pooler on port 5432; transaction pooling is not supported',
    );
  if (url.searchParams.get('sslmode') !== 'verify-full')
    throw new Error('Cloud DATABASE_URL requires sslmode=verify-full');
  // Prevent connection-string options from redirecting SQL to an old schema.
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert'].includes(key))
      throw new Error('Unsupported cloud connection parameter; use sslmode/sslrootcert only');
  }
}
