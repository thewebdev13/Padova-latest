import assert from 'node:assert/strict';

type RecoveryEntry = { path: string; sha256: string; base64: string };
type RecoveryArchive = { format: 'padova-recovery-v1'; entries: RecoveryEntry[] };
const prefix = Buffer.from('{"format":"padova-recovery-v1","entries":[');

/** Preserve v1 bytes without constructing a single string larger than V8 permits. */
export function encodeRecovery(archive: RecoveryArchive): Buffer {
  assert.equal(archive.format, 'padova-recovery-v1');
  return Buffer.concat([
    prefix,
    ...archive.entries.flatMap((entry, i) => [
      ...(i ? [Buffer.from(',')] : []),
      Buffer.from(JSON.stringify(entry)),
    ]),
    Buffer.from(']}'),
  ]);
}

/** Parse each bounded entry; the full decompressed archive remains a Buffer. */
export function decodeRecovery(bytes: Buffer): RecoveryArchive {
  assert.ok(bytes.subarray(0, prefix.length).equals(prefix), 'Unexpected recovery format');
  const entries: RecoveryEntry[] = [];
  let pos = prefix.length;
  while (bytes[pos] !== 93) {
    const start = pos;
    assert.equal(bytes[pos], 123, 'Expected archive entry');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (; pos < bytes.length; pos++) {
      const c = bytes[pos];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === 92) escaped = true;
        else if (c === 34) quoted = false;
      } else if (c === 34) quoted = true;
      else if (c === 123) depth++;
      else if (c === 125 && --depth === 0) {
        pos++;
        break;
      }
    }
    assert.ok(depth === 0 && !quoted && pos <= bytes.length, 'Truncated recovery entry');
    const entry = JSON.parse(bytes.subarray(start, pos).toString('utf8'));
    assert.equal(typeof entry.path, 'string');
    assert.equal(typeof entry.sha256, 'string');
    assert.equal(typeof entry.base64, 'string');
    entries.push(entry);
    if (bytes[pos] === 44) {
      pos++;
      assert.equal(bytes[pos], 123, 'Expected archive entry after comma');
      continue;
    }
    assert.equal(bytes[pos], 93, 'Invalid archive separator');
  }
  assert.equal(bytes.subarray(pos).toString(), ']}', 'Trailing or truncated archive bytes');
  return { format: 'padova-recovery-v1', entries };
}
