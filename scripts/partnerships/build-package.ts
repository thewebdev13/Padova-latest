import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  normalizeWorkbook,
  normalizeMail,
  messageParts,
  type WorkbookCapture,
  type WorkbookMetadata,
  type MailMessage,
} from '../../src/lib/partnerships/normalize';
import { type ImportBundle } from '../../src/lib/partnerships/import';
const evidence = path.resolve(process.argv[2] ?? '.data/partnerships-evidence/2026-11-03');
const destination = path.resolve(process.argv[3] ?? '.data/partnerships-package');
if (process.env.DATABASE_URL)
  throw new Error('Package preparation must not receive live database credentials');
const json = async <T>(filename: string): Promise<T> =>
  JSON.parse(await readFile(path.join(evidence, filename), 'utf8'));
const digest = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const crm = await json<WorkbookCapture>('crm-extracted.json'),
  meta = await json<WorkbookMetadata>('crm-metadata.json');
const books = [{ capture: crm, metadata: meta, filename: 'crm-original.xlsx' }];
for (const file of ['downloads-private.json', 'additional-downloads-private.json']) {
  const entries = await json<{ id: string; metadata: WorkbookMetadata }[]>(file);
  for (const entry of entries)
    books.push({
      capture: await json<WorkbookCapture>(`${entry.id}.json`),
      metadata: entry.metadata,
      filename: `${entry.id}.xlsx`,
    });
}
await mkdir(destination, { recursive: true });
const manifest: {
  version: number;
  createdAt: string;
  files: { file: string; sha256: string; source: string; items: number }[];
  captures: { file: string; sha256: string; rows: number }[];
  mailCoverage?: {
    messages: number;
    attachmentParts: number;
    capturedAttachments: number;
    unavailableAttachments: number;
  };
  exceptions: string[];
} = { version: 1, createdAt: new Date().toISOString(), files: [], captures: [], exceptions: [] };
async function save(bundle: ImportBundle) {
  const file = `bundle-${String(manifest.files.length + 1).padStart(3, '0')}.json`,
    text = JSON.stringify(bundle);
  await writeFile(path.join(destination, file), text, { flag: 'wx' });
  manifest.files.push({
    file,
    sha256: digest(text),
    source: bundle.source.title,
    items: bundle.items.length,
  });
}
for (const [index, book] of books.entries()) {
  const bytes = await readFile(path.join(evidence, book.filename));
  if (digest(bytes) !== book.capture.sha256)
    throw new Error(`Original capture mismatch: ${book.filename}`);
  manifest.captures.push({
    file: book.filename,
    sha256: book.capture.sha256,
    rows: book.capture.sheets.reduce((n, s) => n + s.rows.length, 0),
  });
  for (const bundle of normalizeWorkbook(book.capture, book.metadata, crm, index === 0))
    await save(bundle);
}
const mailFiles = (await readdir(path.join(evidence, 'mail')))
  .filter((f) => /^messages-.*\.json$/.test(f))
  .sort();
const messages: MailMessage[] = [];
const attachments: unknown[] = [];
for (const f of mailFiles) {
  const bytes = await readFile(path.join(evidence, 'mail', f));
  const d = JSON.parse(bytes.toString());
  messages.push(...d.responses);
  manifest.captures.push({ file: `mail/${f}`, sha256: digest(bytes), rows: d.responses.length });
}
if (messages.length) {
  const unique = [...new Map(messages.map((m) => [m.id, m])).values()];
  const direct = await json<{ expectedIds: string[]; capturedIds: string[] }>(
    'mail/direct-originals-manifest.json',
  );
  assert.deepEqual(
    unique.map((m) => m.id).sort(),
    [...new Set(direct.expectedIds)].sort(),
    'Direct mailbox coverage does not match the expected union',
  );
  const attachmentCapture = await json<{
    total: number;
    captured: number;
    unavailable: number;
    parts: {
      message_id: string;
      attachment_id: string;
      filename: string;
      mime: string;
      bytes: number;
      status: string;
      sha256?: string;
      localFile?: string;
      reason?: string;
    }[];
  }>('mail/attachments/reconciliation.json');
  for (const part of attachmentCapture.parts.filter((p) => p.status === 'captured')) {
    const local = path.resolve(evidence, part.localFile!);
    assert.ok(local.startsWith(evidence + path.sep), 'Attachment path escaped evidence root');
    const bytes = await readFile(local);
    assert.equal(bytes.length, part.bytes);
    assert.equal(digest(bytes), part.sha256);
    manifest.captures.push({ file: part.localFile!, sha256: part.sha256!, rows: 1 });
  }
  for (const m of unique)
    for (const p of messageParts(m.payload))
      if (p.filename || p.body?.attachment_id)
        attachments.push({
          messageId: m.id,
          filename: p.filename,
          mime: p.mime_type,
          body: p.body,
        });
  const mailBundle = normalizeMail(
    unique,
    'bookings@padovatravels.com',
    crm,
    digest(JSON.stringify(unique)),
  );
  mailBundle.source.coverage = `${unique.length} original messages: the union of every archived message ID and all pages of the configured bookings mailbox search. Manual capture, not background synchronization.`;
  mailBundle.source.complete = attachmentCapture.unavailable === 0;
  mailBundle.exceptions = attachmentCapture.unavailable
    ? [
        `${attachmentCapture.unavailable} of ${attachmentCapture.total} MIME image parts could not be downloaded through the connector; message text is preserved. ${attachmentCapture.captured} image parts were byte/hash verified.`,
      ]
    : [];
  await save(mailBundle);
  const byId = new Map(mailBundle.items.map((i) => [i.key, i]));
  await save({
    key: `mail-attachments:${digest(JSON.stringify(attachmentCapture))}`,
    captureHash: digest(JSON.stringify(attachmentCapture)),
    source: {
      key: 'gmail:bookings:attachments',
      title: 'Bookings mailbox attachment preservation',
      kind: 'documents',
      location: mailBundle.source.location,
      coverage: `${attachmentCapture.total} MIME parts accounted for; ${attachmentCapture.captured} originals verified and ${attachmentCapture.unavailable} inaccessible. Duplicate image bytes are identified by SHA256.`,
      complete: attachmentCapture.unavailable === 0,
    },
    items: attachmentCapture.parts.map((p) => {
      const parent = byId.get(p.message_id);
      return {
        key: digest(p.message_id + '|' + p.attachment_id),
        locator: p.message_id + '/' + p.filename,
        sourceUrl: parent?.sourceUrl,
        organizationLegacyId: parent?.organizationLegacyId,
        originalText: `Attachment: ${p.filename}\nMessage: ${p.message_id}\nBytes: ${p.bytes}\nCapture: ${p.status}\n${p.sha256 ?? p.reason ?? ''}`,
        payload: p,
        kind:
          parent?.kind === 'excluded'
            ? 'excluded'
            : p.status === 'captured'
              ? 'evidence'
              : 'review',
        matchingMethod: 'Exact parent account/message ID and existing CH mapping',
        reason:
          p.status === 'captured'
            ? 'Original bytes captured and hash verified; stored in private evidence archive'
            : (p.reason ?? 'Attachment inaccessible'),
      };
    }),
    exceptions: mailBundle.exceptions,
  });
  manifest.mailCoverage = {
    messages: unique.length,
    attachmentParts: attachmentCapture.total,
    capturedAttachments: attachmentCapture.captured,
    unavailableAttachments: attachmentCapture.unavailable,
  };
}
// Additional reviewed research/documents are separate inputs; originals are never rewritten.
for (const f of (await readdir(evidence)).filter((f) => f.endsWith('.bundle.json')).sort()) {
  const bundle = await json<ImportBundle>(f);
  await save(bundle);
}
manifest.exceptions.push(
  'Owner expects historical emails in bookings@padovatravels.com. Every message ID from the CRM archive was found there, including four addressed to the chabad@ alias. No known archive message is missing. Independent mailbox-wide coverage of other accounts cannot be certified from bookings alone.',
  'Original MIME text coverage was verified against the full archived-ID/search union. Image-attachment exceptions remain individually identified in the attachment preservation source.',
);
if (!(await readdir(evidence)).includes('zz-original-ranked-report-recovered.bundle.json'))
  manifest.exceptions.push(
    'The original ranked research report has not been recovered; reconstruction remains separately labeled.',
  );
if (attachments.length)
  manifest.exceptions.push(
    `${attachments.length} newly captured MIME attachment/inline parts are listed in attachment-inventory.json; byte capture is reconciled separately.`,
  );
await writeFile(
  path.join(destination, 'attachment-inventory.json'),
  JSON.stringify(attachments, null, 2),
  { flag: 'wx' },
);
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    bundles: manifest.files.length,
    sourceItems: manifest.files.reduce((n, f) => n + f.items, 0),
    originalCaptures: manifest.captures.length,
    attachmentParts: attachments.length,
    destination,
  }),
);
