import { createHash } from 'node:crypto';

type InventoryReader = {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
};
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

export const RECOVERY_FINGERPRINT_ALGORITHM = 'sha256-sorted-row-sha256-v1';

/** Return only compact hashes, not private row contents, over the backup connection. */
export async function recoveryCompactInventory(
  client: InventoryReader,
  schema: string,
  table: string,
) {
  const result = (
    await client.query(`SELECT count(*)::integer AS count,
      encode(sha256(convert_to(COALESCE(string_agg(row_hash,'' ORDER BY row_hash COLLATE "C"),''),'UTF8')),'hex') AS fingerprint
      FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_hash
        FROM ${quote(schema)}.${quote(table)} t) rows_to_hash`)
  ).rows[0];
  if (
    !Number.isSafeInteger(result?.count) ||
    Number(result.count) < 0 ||
    typeof result.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint)
  )
    throw new Error('Invalid compact recovery fingerprint');
  return {
    count: Number(result.count),
    fingerprint_algorithm: RECOVERY_FINGERPRINT_ALGORITHM,
    fingerprint: result.fingerprint,
  };
}

/** Run inside the caller's stable read transaction. Keeps the v1 inventory hashes. */
export async function recoveryTableInventory(
  client: InventoryReader,
  schema: string,
  table: string,
) {
  const hashes: string[] = [];
  let count = 0;
  for (const collation of ['', ' COLLATE "C"']) {
    const digest = createHash('md5');
    let rowsSeen = 0;
    await client.query(
      `DECLARE recovery_inventory_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row_text FROM ${quote(schema)}.${quote(table)} t ORDER BY to_jsonb(t)::text${collation}`,
    );
    try {
      for (;;) {
        const page = (await client.query('FETCH FORWARD 1000 FROM recovery_inventory_rows')).rows;
        if (!page.length) break;
        for (const row of page) {
          if (typeof row.row_text !== 'string') throw new Error('Invalid recovery inventory row');
          digest.update(row.row_text, 'utf8');
          rowsSeen++;
        }
      }
    } finally {
      await client.query('CLOSE recovery_inventory_rows');
    }
    if (hashes.length && rowsSeen !== count) throw new Error('Recovery snapshot count changed');
    count = rowsSeen;
    hashes.push(digest.digest('hex'));
  }
  return { count, hash: hashes[0], canonical_hash: hashes[1] };
}
