import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
// Every environment requires an individual login; no owner/demo authentication bypass.
delete env.PADOVA_LOCAL_DEMO;
const child = spawn(
  process.execPath,
  ['--use-system-ca', require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1'],
  { env, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 1));
