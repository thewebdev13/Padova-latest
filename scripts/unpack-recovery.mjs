// Standalone: Node.js built-ins only. Keep a readable copy beside encrypted Drive backups.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createDecipheriv, createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const [file, destination] = process.argv.slice(2);
if (!file || !destination)
  throw new Error('Usage: node unpack-recovery.mjs <archive.enc> <NEW-folder>');
let encoded = process.env.BACKUP_ENCRYPTION_KEY;
if (!encoded) {
  if (!process.stdin.isTTY)
    throw new Error('Use an interactive terminal for hidden backup-key entry');
  process.stdout.write('Backup key from Padova Recovery Kit (hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  encoded = await new Promise((resolve, reject) => {
    let value = '';
    const input = (chunk) => {
      for (const c of chunk.toString()) {
        if (c === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        if (c === '\r' || c === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    const cleanup = () => {
      process.stdin.off('data', input);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    process.stdin.on('data', input);
  });
}
const key = Buffer.from(encoded.trim(), 'base64');
if (key.length !== 32 || key.toString('base64') !== encoded.trim())
  throw new Error('Use the exact base64 32-byte backup key');
const bytes = await readFile(file),
  magic = Buffer.from('PADOVA1');
if (bytes.length < 35 || !bytes.subarray(0, 7).equals(magic))
  throw new Error('Not a Padova encrypted archive');
const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(7, 19));
decipher.setAAD(magic);
decipher.setAuthTag(bytes.subarray(19, 35));
const archive = JSON.parse(
  gunzipSync(Buffer.concat([decipher.update(bytes.subarray(35)), decipher.final()])).toString(),
);
if (archive.format !== 'padova-recovery-v1') throw new Error('Unsupported recovery format');
const root = path.resolve(destination);
// A fresh directory prevents accidental overwrite and symlink traversal through existing content.
await mkdir(root, { mode: 0o700 });
for (const entry of archive.entries) {
  if (typeof entry.path !== 'string' || entry.path.includes('\\'))
    throw new Error('Unsafe archive path');
  const output = path.resolve(root, entry.path);
  if (!output.startsWith(root + path.sep)) throw new Error('Unsafe archive path');
  const data = Buffer.from(entry.base64, 'base64');
  if (createHash('sha256').update(data).digest('hex') !== entry.sha256)
    throw new Error('File checksum mismatch');
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, data, { mode: 0o600, flag: 'wx' });
}
console.log(
  `Authenticated recovery archive unpacked: ${archive.entries.length} files into ${root}`,
);
console.log(
  'Read repository/docs/RECOVERY_RUNBOOK.md. Do not restore into an existing live project or enable financial entry automatically.',
);
