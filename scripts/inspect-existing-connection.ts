import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { PADOVA_PROJECT } from '../src/lib/project';
import { connectionDiagnostics } from '../src/lib/connection-diagnostics';
const file = process.argv[2] ?? '.env.local';
const config = parseEnv(await readFile(file, 'utf8'));
if (!config.DATABASE_URL) throw new Error('The private environment file has no DATABASE_URL');
try {
  const result = await connectionDiagnostics({ ...config, PADOVA_DATABASE_MODE: 'supabase' });
  console.log(JSON.stringify({ project: PADOVA_PROJECT.ref, ...result }));
} catch (error: any) {
  console.error(
    `Read-only connection verification failed (${error.code ?? 'connection error'}). No credentials or database rows are printed; verify network, credentials and trusted TLS certificates.`,
  );
  process.exitCode = 1;
}
