import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Packaging only: no database connection, hosting mutation or secret upload.
const root = process.cwd();
const destination = path.resolve('.data/production-artifact');
if (!destination.startsWith(root + path.sep)) throw new Error('Workspace destination required');
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
const config = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.ts',
  'render.yaml',
  '.gitignore',
  '.prettierrc.json',
]);
const files = tracked.filter((file) => /^(src|public|certs)\//.test(file) || config.has(file));
if (!files.includes('render.yaml')) throw new Error('Commit the reviewed deployment configuration');
if (fs.existsSync(destination) && fs.readdirSync(destination).length)
  throw new Error('Use a fresh artifact directory; do not mix old deployment contents');
const hashes = {};
for (const file of files) {
  const bytes = fs.readFileSync(file);
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
}
const manifest = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  applicationBaseline: 'bcfbf2adb23a6e07342bc8eb2c0a16dfa0de0ad8',
  productionSupabase: 'unugynfzmxjxifgofxjr',
  qaSupabaseMustNotBeConfigured: 'cnpyvmhgbtyleckyirye',
  destination,
  files: hashes,
  secretsIncluded: false,
  dataIncluded: false,
  deployed: false,
};
fs.writeFileSync('.data/production-artifact-manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ files: files.length, commit: manifest.commit, deployed: false }));
