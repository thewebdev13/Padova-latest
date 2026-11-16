import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createDatabase, migrate, one } from '../../src/lib/db';
import { bootstrapOwner, login, sessionActor } from '../../src/lib/users';
import { importPartnershipBundle, type ImportBundle } from '../../src/lib/partnerships/import';
import { hash, safeText, safeValue } from '../../src/lib/partnerships/service';
import { storeDocument, readDocument } from '../../src/lib/partnerships/documents';
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
const input = path.resolve(process.argv[2] ?? '.data/partnerships-package');
const output = path.resolve(process.argv[3] ?? '.data/partnerships-reconciliation');
const evidence = process.argv[4] ? path.resolve(process.argv[4]) : null;
if (process.env.DATABASE_URL) throw new Error('This verifier never connects to a shared database');
const manifest = JSON.parse(await readFile(path.join(input, 'manifest.json'), 'utf8'));
const db = await createDatabase(true);
const results: unknown[] = [];
try {
  await migrate(db);
  const password = randomBytes(32).toString('base64url');
  const owner = await bootstrapOwner(db, {
    name: 'Isolated import reviewer',
    email: 'source-review@example.invalid',
    password,
  });
  const actor = (await sessionActor(
    db,
    (await login(db, { email: owner.email, password })).token,
  ))!;
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(input, file.file));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      file.sha256,
      'Package file changed',
    );
    const bundle: ImportBundle = JSON.parse(bytes.toString());
    const result = await importPartnershipBundle(db, actor, bundle);
    assert.equal(result.source_items, bundle.items.length);
    assert.equal(
      result.imported +
        result.duplicate_copies +
        result.unresolved +
        result.excluded +
        result.errors,
      bundle.items.length,
    );
    const source = await one(db, 'SELECT id FROM pt_sources WHERE key=$1', [bundle.source.key]);
    const saved = (
      await db.query(
        "SELECT *,encode(convert_to(original_text,'UTF8'),'hex') original_text_utf8 FROM pt_source_items WHERE source_id=$1",
        [source.id],
      )
    ).rows;
    const mapped = new Map(saved.map((s) => [s.source_key + '|' + s.fingerprint, s]));
    for (const item of bundle.items) {
      const row = mapped.get(item.key + '|' + hash(item));
      assert.ok(row, `Missing source outcome ${item.key}`);
      // PGlite's scalar TextDecoder consumes a leading BOM. Compare stored UTF-8 bytes,
      // rather than changing the source or mistaking a decoder artifact for missing text.
      assert.equal(
        hash(row.original_text_utf8),
        hash(Buffer.from(safeText(item.originalText), 'utf8').toString('hex')),
        `Full stored source bytes differ: ${item.key}`,
      );
      assert.equal(
        hash(canonical(row.payload)),
        hash(canonical(safeValue(item.payload))),
        `Full source cells/metadata differ: ${item.key}`,
      );
      if (item.interaction && row.target_id && row.outcome === 'imported') {
        const h = await one(
          db,
          "SELECT encode(convert_to(body,'UTF8'),'hex') body_utf8 FROM pt_interactions WHERE id=$1",
          [row.target_id],
        );
        assert.equal(
          hash(h.body_utf8),
          hash(Buffer.from(safeText(item.interaction.body), 'utf8').toString('hex')),
          `Stored interaction bytes differ: ${item.key}`,
        );
      }
    }
    const replay = await importPartnershipBundle(db, actor, bundle);
    assert.equal(replay.created, 0);
    assert.equal(
      Number(
        (await one(db, 'SELECT count(*) n FROM pt_source_items WHERE source_id=$1', [source.id])).n,
      ),
      saved.length,
    );
    const row = {
      source: bundle.source.title,
      ...result,
      verifiedFullText: true,
      replayCreated: replay.created,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
  const importedDocuments: { id: string; sha256: string }[] = [];
  if (evidence) {
    process.env.PADOVA_PARTNERSHIP_DOCUMENT_KEY = randomBytes(32).toString('base64');
    const attached = (
      await db.query(
        "SELECT i.* FROM pt_source_items i JOIN pt_sources s ON s.id=i.source_id WHERE s.key='gmail:bookings:attachments' AND i.organization_id IS NOT NULL AND i.outcome<>'excluded' AND i.payload->>'status'='captured' ORDER BY i.id",
      )
    ).rows;
    const seen = new Set<string>();
    for (const item of attached) {
      const key = item.organization_id + '|' + item.payload.sha256;
      if (seen.has(key)) continue;
      const local = path.resolve(evidence, item.payload.localFile);
      assert.ok(local.startsWith(evidence + path.sep), 'Attachment path escaped evidence root');
      const bytes = await readFile(local);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), item.payload.sha256);
      const options = {
        commandId: crypto.randomUUID(),
        sourceItemId: item.id,
        channel: 'import' as const,
      };
      const result = await storeDocument(
        db,
        actor,
        item.organization_id,
        item.payload.filename,
        item.payload.mime,
        bytes,
        options,
      );
      assert.deepEqual(
        await storeDocument(
          db,
          actor,
          item.organization_id,
          item.payload.filename,
          item.payload.mime,
          bytes,
          options,
        ),
        result,
        'Document replay differs',
      );
      assert.equal(
        createHash('sha256')
          .update((await readDocument(db, actor, result.id)).bytes)
          .digest('hex'),
        item.payload.sha256,
      );
      importedDocuments.push({ id: result.id, sha256: item.payload.sha256 });
      seen.add(key);
    }
  }
  assert.equal(
    Number(
      (await one(db, "SELECT count(*) n FROM pt_organizations WHERE relationship='active'")).n,
    ),
    0,
    'Historical imports must never activate a partnership',
  );
  assert.equal(
    Number((await one(db, 'SELECT count(*) n FROM bookings')).n),
    0,
    'Source review must not create financial records',
  );
  const counts = await one(
    db,
    `SELECT (SELECT count(*) FROM pt_organizations) organizations,(SELECT count(*) FROM pt_interactions) interactions,(SELECT count(*) FROM pt_research) research,(SELECT count(*) FROM pt_reviews WHERE status='open') reviews,(SELECT count(*) FROM pt_source_items) preserved_source_items,(SELECT count(*) FROM pt_documents) private_documents`,
  );
  await mkdir(output, { recursive: true });
  if (importedDocuments.length)
    await writeFile(
      path.join(output, 'document-key-private.json'),
      JSON.stringify({ key: process.env.PADOVA_PARTNERSHIP_DOCUMENT_KEY }),
      { flag: 'wx' },
    );
  const archive = await db.dump!();
  await writeFile(
    path.join(output, 'private-review.pglite'),
    Buffer.from(await archive.arrayBuffer()),
    { flag: 'wx' },
  );
  const restored = await createDatabase(true, archive);
  try {
    for (const table of [
      'pt_organizations',
      'pt_interactions',
      'pt_source_items',
      'pt_research',
      'pt_reviews',
      'pt_commands',
      'pt_audit',
      'pt_contacts',
      'pt_contact_methods',
      'pt_campaigns',
      'pt_opportunities',
      'pt_sources',
      'pt_import_batches',
      'pt_agreements',
      'pt_referrals',
      'pt_drafts',
      'pt_source_resolutions',
      'pt_documents',
      'pt_ai_grants',
      'pt_ai_refresh_tokens',
      'pt_oauth_clients',
    ]) {
      const original = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows,
        copy = (await restored.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      assert.equal(hash(copy), hash(original), `Restore mismatch: ${table}`);
    }
    assert.equal(
      hash((await restored.query('SELECT * FROM pt_oauth_codes ORDER BY code_hash')).rows),
      hash((await db.query('SELECT * FROM pt_oauth_codes ORDER BY code_hash')).rows),
    );
    for (const document of importedDocuments)
      assert.equal(
        createHash('sha256')
          .update((await readDocument(restored, actor, document.id)).bytes)
          .digest('hex'),
        document.sha256,
        'Restored document bytes differ',
      );
  } finally {
    await restored.close();
  }
  await writeFile(
    path.join(output, 'reconciliation.json'),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        counts,
        results,
        exceptions: manifest.exceptions,
        restoreVerified: true,
        productionImported: false,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ counts, restoreVerified: true, output }));
} finally {
  await db.close();
}
