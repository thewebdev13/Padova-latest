import { testOwner } from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { encryptBackup, decryptBackup, backupKey } from '../src/lib/backup';
import { createDatabase, migrate, one } from '../src/lib/db';
import { execute } from '../src/lib/finance';
import { hashPassword, verifyPassword } from '../src/lib/credentials';
test('password hashing rejects wrong password and stores no plaintext', () => {
  const hash = hashPassword('synthetic-test-password-only');
  assert.ok(verifyPassword('synthetic-test-password-only', hash));
  assert.ok(!verifyPassword('different', hash));
  assert.ok(!hash.includes('synthetic'));
});
test('encrypted backup is authenticated and restores to an isolated PostgreSQL instance', async () => {
  const source = await createDatabase(true);
  let archive: Blob;
  try {
    await migrate(source);
    await execute(source, testOwner, {
      id: randomUUID(),
      kind: 'party',
      data: {
        name: 'Synthetic recovery record',
        kind: 'person',
        roles: ['customer', 'traveler', 'seller'],
      },
    });
    archive = await source.dump!();
  } finally {
    await source.close();
  }
  const key = randomBytes(32),
    encrypted = encryptBackup(new Uint8Array(await archive.arrayBuffer()), key);
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
  const plain = decryptBackup(encrypted, key),
    restored = await createDatabase(true, new Blob([new Uint8Array(plain)]));
  try {
    const person = await one(restored, 'SELECT * FROM parties');
    assert.equal(person.name, 'Synthetic recovery record');
    const audit = await one(restored, 'SELECT count(*) count FROM audit_events');
    assert.equal(Number(audit.count), 1);
  } finally {
    await restored.close();
  }
  assert.equal(backupKey(key.toString('base64')).length, 32);
});
