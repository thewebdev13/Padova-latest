import { spawn } from 'node:child_process';
import path from 'node:path';
// Explicit allowlist: never inherit .env.local, cloud credentials, recovery or source locations.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|USERNAME|USERDOMAIN|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMSPEC|PATHEXT|NODE_EXTRA_CA_CERTS)$/i.test(
      k,
    ),
  ),
);
Object.assign(env, {
  PADOVA_QA: '1',
  PADOVA_DATABASE_MODE: 'local',
  PADOVA_DATA_DIR: path.resolve('.data/remote-qa'),
  NODE_ENV: 'production',
  PADOVA_QA_BUILD: '1',
  __NEXT_PROCESSED_ENV: 'true',
});
const action = process.argv[2] ?? 'start';
const args =
  action === 'setup'
    ? ['--import', 'tsx', 'scripts/setup-qa.ts']
    : action === 'upgrade'
      ? ['--import', 'tsx', 'scripts/upgrade-practice-v1.ts']
      : action === 'test'
        ? ['--import', 'tsx', 'scripts/test-qa.ts', ...process.argv.slice(3)]
        : action === 'build'
          ? ['node_modules/next/dist/bin/next', 'build']
          : action === 'start'
            ? [
                'node_modules/next/dist/bin/next',
                'start',
                '--hostname',
                '127.0.0.1',
                '--port',
                '3010',
              ]
            : null;
if (!args) throw new Error('Use setup, build, start or test');
const child = spawn(process.execPath, ['--use-system-ca', ...args], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
