import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Validates by default. Apply only to the approved application with an individual session.
// PADOVA_IMPORT_SESSION_FILE contains only the padova_session token, never a database key.
const [directory, rawOrigin, mode] = process.argv.slice(2);
if (!directory || !rawOrigin)
  throw new Error('Usage: import-package-http.ts package-directory origin [--apply]');
const origin = new URL(rawOrigin).origin;
if (
  rawOrigin !== origin ||
  (!origin.startsWith('https://') && !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
)
  throw new Error('Use a clean HTTPS origin, or local loopback');
if (process.env.DATABASE_URL)
  throw new Error('HTTP importer must not receive database credentials');
const root = path.resolve(directory),
  manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const bundles = [];
for (const entry of manifest.files) {
  const file = path.resolve(root, entry.file);
  assert.ok(file.startsWith(root + path.sep), 'Bundle must remain inside package directory');
  const bytes = await readFile(file);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    'Bundle SHA256 changed',
  );
  const bundle = JSON.parse(bytes.toString('utf8'));
  assert.equal(bundle.items.length, entry.items);
  assert.ok(bytes.length <= 64 * 1024 * 1024, 'Bundle exceeds API limit');
  bundles.push({ entry, bytes });
}
if (mode !== '--apply')
  console.log(
    JSON.stringify({
      validated: bundles.length,
      source_items: bundles.reduce((n, b) => n + b.entry.items, 0),
      origin,
      applied: false,
    }),
  );
else {
  if (
    !['localhost', '127.0.0.1'].includes(new URL(origin).hostname) &&
    process.env.PADOVA_APPROVED_IMPORT_ORIGIN !== origin
  )
    throw new Error(
      'Production cutover must be explicitly approved and PADOVA_APPROVED_IMPORT_ORIGIN set to its exact origin',
    );
  const token = (await readFile(process.env.PADOVA_IMPORT_SESSION_FILE ?? '', 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error('Private session file must contain only the individual staff session token');
  const results = [];
  for (const { entry, bytes } of bundles) {
    const response = await fetch(origin + '/api/partnerships/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: 'padova_session=' + token,
      },
      body: bytes.toString('utf8'),
      redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `Import stopped at ${entry.file}: HTTP ${response.status}; prior batches remain safely replayable`,
      );
    assert.equal(result.source_items, entry.items);
    results.push({ file: entry.file, ...result });
    console.log(JSON.stringify({ file: entry.file, ...result }));
  }
  const receipt = path.join(root, `http-receipt-${Date.now()}.json`);
  await writeFile(
    receipt,
    JSON.stringify({ origin, completedAt: new Date().toISOString(), results }, null, 2),
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ verifiedBatches: results.length, receipt }));
}
