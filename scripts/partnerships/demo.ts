import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createDatabase, migrate } from '../../src/lib/db';
import { syntheticPartnerships } from './synthetic-fixture';
if (
  process.env.DATABASE_URL ||
  process.env.PADOVA_DATABASE_MODE === 'supabase' ||
  process.env.PADOVA_QA
)
  throw new Error('Synthetic preview must never receive shared database settings');
const root = path.resolve('.data/partnerships-demo'),
  mode = process.argv[2] ?? 'start';
process.env.PADOVA_DATABASE_MODE = 'local';
process.env.PADOVA_DATA_DIR = path.join(root, 'database');
if (mode === 'setup') {
  await mkdir(root, { recursive: true });
  const db = await createDatabase();
  try {
    await migrate(db);
    if ((await db.query('SELECT id FROM staff LIMIT 1')).rows.length)
      throw new Error('Synthetic fixture already exists; no overwrite');
    const fixture = await syntheticPartnerships(db);
    await writeFile(
      path.join(root, 'credentials-private.json'),
      JSON.stringify({ ...fixture, documentKey: randomBytes(32).toString('base64') }, null, 2),
      { flag: 'wx' },
    );
    console.log(
      'Synthetic fixture ready. Individual credentials are in the ignored private credentials file.',
    );
  } finally {
    await db.close();
  }
} else if (mode === 'start') {
  const config = JSON.parse(await readFile(path.join(root, 'credentials-private.json'), 'utf8'));
  const port = process.env.PORT ?? '3341';
  const publicOrigin = process.env.PADOVA_PARTNERSHIP_ORIGIN ?? `http://127.0.0.1:${port}`;
  if (publicOrigin !== `http://127.0.0.1:${port}` && !/^https:\/\/[^/]+$/.test(publicOrigin))
    throw new Error('Preview OAuth origin must be loopback or an explicit HTTPS origin');
  const child = spawn(
    process.execPath,
    [
      createRequire(import.meta.url).resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      port,
    ],
    {
      env: {
        ...process.env,
        PADOVA_PARTNERSHIP_ORIGIN: publicOrigin,
        PADOVA_PARTNERSHIP_REDIRECT_URIS: 'https://chatgpt.com/connector_platform_oauth_redirect',
        PADOVA_PARTNERSHIP_DOCUMENT_KEY: config.documentKey,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'inherit',
    },
  );
  process.on('SIGINT', () => child.kill());
  process.on('SIGTERM', () => child.kill());
  child.on('exit', (code) => process.exit(code ?? 1));
} else throw new Error('Use setup or start');
