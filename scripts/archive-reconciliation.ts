import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { backupKey, encryptBackup, decryptBackup } from '../src/lib/backup';

const roots = [
  '.data/historical-cutover/current-cells-20261031-resumed',
  '.data/historical-cutover/reconciliation-resumed',
  ...process.argv.slice(2),
];
const privateRoot = path.resolve('.data/historical-cutover') + path.sep;
if (roots.some((root) => !path.resolve(root).startsWith(privateRoot)))
  throw new Error('Private historical workspace required');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const files: { path: string; sha256: string; base64: string }[] = [];
async function walk(folder: string) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const p = path.join(folder, item.name);
    if (item.isDirectory()) await walk(p);
    else {
      const bytes = await readFile(p);
      files.push({
        path: p.replaceAll('\\', '/'),
        sha256: sha(bytes),
        base64: bytes.toString('base64'),
      });
    }
  }
}
for (const root of roots) await walk(root);
files.sort((a, b) => a.path.localeCompare(b.path));
const directory = path.resolve('.data/reconciliation-recovery', randomUUID());
await mkdir(directory, { recursive: true });
const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY),
  archive = encryptBackup(
    gzipSync(JSON.stringify({ format: 'padova-private-reconciliation-v1', files })),
    key,
  );
const archivePath = path.join(directory, 'reconciliation.enc');
await writeFile(archivePath, archive, { flag: 'wx' });
const restored = JSON.parse(gunzipSync(decryptBackup(await readFile(archivePath), key)).toString());
if (
  restored.format !== 'padova-private-reconciliation-v1' ||
  restored.files.length !== files.length
)
  throw new Error('Archive manifest mismatch');
for (const f of restored.files) {
  const target = path.resolve(directory, 'restored', f.path);
  if (!target.startsWith(path.join(directory, 'restored') + path.sep))
    throw new Error('Unsafe restore path');
  const bytes = Buffer.from(f.base64, 'base64');
  if (sha(bytes) !== f.sha256) throw new Error('Archive checksum mismatch');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  if (sha(await readFile(target)) !== f.sha256) throw new Error('Restored checksum mismatch');
}
const proof = {
  verifiedAt: new Date().toISOString(),
  archive: archivePath,
  archiveSha256: sha(archive),
  bytes: archive.length,
  files: files.length,
  allRestoredFilesMatch: true,
  productionWrites: 0,
  manifest: files.map(({ path, sha256 }) => ({ path, sha256 })),
};
await writeFile(path.join(directory, 'verification.json'), JSON.stringify(proof, null, 2), {
  flag: 'wx',
});
await writeFile(
  '.data/historical-cutover/reconciliation-resumed/private-recovery-proof.json',
  JSON.stringify({ ...proof, manifest: undefined }, null, 2),
);
console.log(JSON.stringify({ ...proof, manifest: undefined }));
