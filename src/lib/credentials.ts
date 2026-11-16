import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export function hashPassword(password: string) {
  if (password.length < 14) throw new Error('Use at least 14 characters');
  const salt = randomBytes(16).toString('hex');
  // OWASP scrypt profile: N=2^14, r=8, p=5 (16 MiB plus overhead).
  return `scrypt$16384$8$5$${salt}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string) {
  const modern = hash.startsWith('scrypt$16384$8$5$');
  const [salt, key] = modern ? hash.split('$').slice(4) : hash.split(':');
  if (!salt || !key) return false;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key)) return false;
  const expected = Buffer.from(key, 'hex'),
    actual = scryptSync(
      password,
      salt,
      64,
      modern ? { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 } : undefined,
    );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
