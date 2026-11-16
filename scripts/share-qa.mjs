import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

if (!existsSync('.data/remote-qa-access/ready.json'))
  throw new Error('Initialize QA first: node scripts/qa.mjs setup');
if (!existsSync('.next-qa/BUILD_ID')) throw new Error('Build QA first: node scripts/qa.mjs build');
const tunnelPath = path.resolve('.data/qa-tools/cloudflared.exe');
if (!existsSync(tunnelPath))
  throw new Error(
    'Install official Cloudflare cloudflared in .data/qa-tools; see docs/REMOTE_QA.md',
  );
const alive = (id) => {
  try {
    process.kill(id, 0);
    return true;
  } catch {
    return false;
  }
};
let existing;
try {
  existing = JSON.parse(await readFile('.data/qa-processes.json', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
if (existing && alive(existing.server) && alive(existing.tunnel)) {
  console.log('QA is already running:', (await readFile('.data/qa-url.txt', 'utf8')).trim());
  process.exit(0);
}
try {
  await fetch('http://127.0.0.1:3010/api/state', { signal: AbortSignal.timeout(2000) });
  throw new Error('Port 3010 is in use. Inspect existing QA processes before restarting.');
} catch (e) {
  if (e.message.startsWith('Port 3010')) throw e;
}
function launch(file, args, prefix, env) {
  const out = openSync(`.data/${prefix}.log`, 'w'),
    err = openSync(`.data/${prefix}-error.log`, 'w');
  try {
    const child = spawn(file, args, {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, err],
      env,
    });
    child.unref();
    return child.pid;
  } finally {
    closeSync(out);
    closeSync(err);
  }
}
// The QA launcher filters its environment again before starting Next.
const server = launch(process.execPath, ['scripts/qa.mjs', 'start'], 'qa-server', process.env);
const tunnelEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|COMSPEC|PATHEXT)$/i.test(
      k,
    ),
  ),
);
const tunnel = launch(
  tunnelPath,
  ['tunnel', '--url', 'http://127.0.0.1:3010', '--protocol', 'http2', '--no-autoupdate'],
  'qa-tunnel',
  tunnelEnv,
);
await writeFile('.data/qa-processes.json', JSON.stringify({ server, tunnel }, null, 2));
for (let attempt = 0; attempt < 30; attempt++) {
  await delay(1000);
  const log = await readFile('.data/qa-tunnel-error.log', 'utf8');
  const url = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url) {
    await writeFile('.data/qa-url.txt', url + '\n');
    console.log(
      `QA link: ${url}\nKeep this computer awake and online while testing. Restarting the tunnel changes the URL; data and logins persist.`,
    );
    process.exit(0);
  }
}
throw new Error(
  'No tunnel URL yet. Inspect .data/qa-tunnel-error.log; do not start a duplicate tunnel.',
);
