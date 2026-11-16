import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeRecovery, decodeRecovery } from '../src/lib/recovery-archive';

test('bounded recovery encoding preserves the existing v1 archive bytes and binary entries', () => {
  const bytes = Buffer.from([0, 255, 127, 1, 34]);
  const archive = {
    format: 'padova-recovery-v1' as const,
    entries: [
      {
        path: 'evidence/é {quote}"\\.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        base64: bytes.toString('base64'),
      },
      { path: 'empty', sha256: '', base64: '' },
    ],
  };
  const encoded = encodeRecovery(archive);
  assert.deepEqual(encoded, Buffer.from(JSON.stringify(archive)));
  assert.deepEqual(decodeRecovery(encoded), archive);
  assert.deepEqual(Buffer.from(decodeRecovery(encoded).entries[0].base64, 'base64'), bytes);
  assert.deepEqual(
    decodeRecovery(encodeRecovery({ format: 'padova-recovery-v1', entries: [] })).entries,
    [],
  );
});

test('bounded recovery parsing rejects damaged framing and incomplete entries', () => {
  const good = encodeRecovery({
    format: 'padova-recovery-v1',
    entries: [{ path: 'one', sha256: '', base64: '' }],
  });
  for (const bad of [
    good.subarray(0, -1),
    good.subarray(0, -5),
    Buffer.concat([good, Buffer.from('extra')]),
    Buffer.from(good.toString().replace('}]}', '},]}')),
    Buffer.from('{"format":"wrong","entries":[]}'),
  ]) {
    assert.throws(() => decodeRecovery(bad));
  }
});
