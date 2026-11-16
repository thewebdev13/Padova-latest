import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const magic = Buffer.from('PADOVA1');
export function backupKey(encoded: string | undefined) {
  if (!encoded)
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must contain a separately stored base64-encoded 32-byte key',
    );
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Backup key must be 32 bytes');
  return key;
}
export function encryptBackup(data: Uint8Array, key: Buffer) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext]);
}
export function decryptBackup(data: Uint8Array, key: Buffer) {
  const bytes = Buffer.from(data);
  if (bytes.length < 35 || !bytes.subarray(0, 7).equals(magic))
    throw new Error('Invalid Padova encrypted backup');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(7, 19));
  decipher.setAAD(magic);
  decipher.setAuthTag(bytes.subarray(19, 35));
  return Buffer.concat([decipher.update(bytes.subarray(35)), decipher.final()]);
}
