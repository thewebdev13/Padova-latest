import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  normalizeMail,
  messageParts,
  type MailMessage,
  type WorkbookCapture,
} from '../../src/lib/partnerships/normalize';

// Read-only preparation. Capture full messages with the connected Gmail tool, not snippets.
// Existing immutable workbook identity mappings are reused; new threads remain for review.
const [captureFile, crmFile, destination, account = 'bookings@padovatravels.com'] =
  process.argv.slice(2);
if (!captureFile || !crmFile || !destination)
  throw new Error(
    'Usage: prepare-mail-refresh.ts full-messages.json crm-extracted.json NEW-output-directory [account]',
  );
if (process.env.DATABASE_URL)
  throw new Error('Mail preparation must not receive database credentials');
const bytes = await readFile(captureFile);
const capture = JSON.parse(bytes.toString('utf8'));
const messages: MailMessage[] = Array.isArray(capture) ? capture : capture.messages;
if (
  !Array.isArray(messages) ||
  messages.some((m) => !m.id || !m.thread_id || !m.payload?.headers || !m.payload?.mime_type)
)
  throw new Error('Full Gmail messages with MIME payloads required');
if (new Set(messages.map((m) => m.id)).size !== messages.length)
  throw new Error(
    'Capture has repeated message IDs; preserve it and prepare an explicit unique-ID capture',
  );
const crm: WorkbookCapture = JSON.parse(await readFile(crmFile, 'utf8'));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const bundle = normalizeMail(messages, account, crm, sha256);
await mkdir(destination, { recursive: false });
await writeFile(path.join(destination, 'original-messages.json'), bytes, { flag: 'wx' });
const serialized = JSON.stringify(bundle);
await writeFile(path.join(destination, 'bundle-001.json'), serialized, { flag: 'wx' });
const parts = messages.flatMap((m) =>
  messageParts(m.payload)
    .filter((p) => p.filename || p.body?.attachment_id)
    .map((p) => ({
      message_id: m.id,
      attachment_id: p.body?.attachment_id,
      filename: p.filename,
      mime_type: p.mime_type,
      size: p.body?.size,
      status: 'requires_private_capture',
    })),
);
await writeFile(
  path.join(destination, 'attachment-inventory.json'),
  JSON.stringify(parts, null, 2),
  { flag: 'wx' },
);
await writeFile(
  path.join(destination, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      createdAt: new Date().toISOString(),
      files: [
        {
          file: 'bundle-001.json',
          sha256: createHash('sha256').update(serialized).digest('hex'),
          source: bundle.source.title,
          items: messages.length,
        },
      ],
      captures: [{ file: 'original-messages.json', sha256, rows: messages.length }],
      exceptions: bundle.exceptions,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    messages: messages.length,
    attachments: parts.length,
    destination: path.resolve(destination),
    mode: 'Prepared manual refresh; no database writes or background sync',
  }),
);
