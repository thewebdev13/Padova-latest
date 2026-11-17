import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import {
  assertAllowedIntakeMailbox,
  buildIntakeDrafts,
  buildIntakeDraftsFromEntries,
  extractIntakeText,
  looksLikeEml,
  parseEmlEnvelope,
  INTAKE_BATCH_SIZE,
  INTAKE_MAX_ENTRIES,
  type IntakeSource,
} from '@/lib/booking-intake';
import { database } from '@/lib/db';
import { execute } from '@/lib/finance';
import { buildIntakeMappingPreview, UNREAD_FILE_MESSAGE } from '@/lib/intake-preview';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import { AccessError } from '@/lib/users';

const SOURCES = new Set<IntakeSource>(['staff_upload', 'staff_paste', 'email', 'whatsapp']);

export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const contentType = request.headers.get('content-type') ?? '';
    let source: IntakeSource = 'staff_paste';
    let text = '';
    let filename: string | undefined;
    let mimeType: string | undefined;
    let bytes: Buffer | undefined;
    let fromAddress: string | undefined;
    let subject: string | undefined;
    let mailbox: string | undefined;
    let commandId = crypto.randomUUID();
    let entries: string[] | undefined;
    let entryOffset = 0;
    let entryTotal: number | undefined;
    let previewOnly = false;

    if (contentType.includes('multipart/form-data')) {
      const limit = 11 * 1024 * 1024;
      if (Number(request.headers.get('content-length')) > limit) throw new Error('File too large');
      const reader = request.body?.getReader();
      if (!reader) throw new Error('Intake body required');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > limit) {
          await reader.cancel();
          throw new Error('File too large');
        }
        chunks.push(next.value);
      }
      const data = await new Response(Buffer.concat(chunks), {
        headers: { 'Content-Type': contentType },
      }).formData();
      const rawSource = String(data.get('source') || 'staff_upload');
      if (!SOURCES.has(rawSource as IntakeSource)) throw new Error('Unsupported intake source');
      source = rawSource as IntakeSource;
      text = String(data.get('text') || '');
      fromAddress = String(data.get('from_address') || '') || undefined;
      subject = String(data.get('subject') || '') || undefined;
      mailbox = String(data.get('mailbox') || '') || undefined;
      commandId = String(data.get('command_id') || commandId);
      previewOnly =
        String(data.get('preview_only') || '') === '1' ||
        String(data.get('preview_only') || '').toLowerCase() === 'true';
      const file = data.get('file');
      // Node/Undici may give File or Blob depending on runtime — both have arrayBuffer.
      if (file instanceof Blob) {
        filename =
          file instanceof File && file.name
            ? file.name
            : String(data.get('filename') || 'upload');
        mimeType = file.type || 'application/octet-stream';
        bytes = Buffer.from(await file.arrayBuffer());
        if (!bytes.length) throw new Error('Uploaded file was empty');
        if (source === 'staff_paste') source = 'staff_upload';
      }
    } else {
      const body = await request.json();
      const rawSource = String(body.source || 'staff_paste');
      if (!SOURCES.has(rawSource as IntakeSource)) throw new Error('Unsupported intake source');
      source = rawSource as IntakeSource;
      text = String(body.text || '');
      fromAddress = body.from_address ? String(body.from_address) : undefined;
      subject = body.subject ? String(body.subject) : undefined;
      mailbox = body.mailbox ? String(body.mailbox) : undefined;
      commandId = String(body.command_id || commandId);
      previewOnly = Boolean(body.preview_only);
      filename = body.filename ? String(body.filename) : undefined;
      mimeType = body.mime_type ? String(body.mime_type) : undefined;
      entryOffset = Math.max(0, Number(body.entry_offset) || 0);
      entryTotal =
        body.entry_total != null ? Math.max(0, Number(body.entry_total) || 0) : undefined;
      if (Array.isArray(body.entries)) {
        const batch = body.entries
          .map((e: unknown) => String(e ?? ''))
          .filter((e: string) => e.trim());
        if (batch.length > INTAKE_BATCH_SIZE)
          throw new Error(`Send at most ${INTAKE_BATCH_SIZE} entries per batch`);
        entries = batch;
      }
      if (body.content_base64) {
        bytes = Buffer.from(String(body.content_base64), 'base64');
        if (bytes.length > 10 * 1024 * 1024) throw new Error('Intake file must be 10 MB or smaller');
        if (source === 'staff_paste') source = 'staff_upload';
      }
    }

    if (
      source === 'email' &&
      (!mailbox || !fromAddress || !subject) &&
      (bytes?.length || text.trim())
    ) {
      const raw =
        bytes?.length &&
        (looksLikeEml(bytes.toString('utf8')) ||
          /\.eml$/i.test(filename || '') ||
          mimeType === 'message/rfc822')
          ? bytes.toString('utf8')
          : looksLikeEml(text)
            ? text
            : '';
      if (raw) {
        const envelope = parseEmlEnvelope(raw);
        mailbox = mailbox || envelope.mailbox;
        fromAddress = fromAddress || envelope.from_address;
        subject = subject || envelope.subject;
      }
    }
    if (source === 'email') assertAllowedIntakeMailbox(mailbox);

    if (!entries?.length && !text.trim() && !bytes?.length)
      throw new Error('Provide intake text and/or a file; drafts never post money');

    // Preview only: extract PDF text-layer / image OCR, return mapping — never writes.
    if (previewOnly) {
      let previewText = text;
      let unread = false;
      let unreadMessage: string | undefined;
      if (bytes?.length) {
        const mime = mimeType || 'application/octet-stream';
        const name = filename || 'upload';
        let extracted = await extractIntakeText(mime, bytes, name);
        // Dev/Turbopack: first PDF compile can fail; one retry usually succeeds (same as refresh).
        if (!extracted.extractable && /\.pdf$/i.test(name)) {
          await new Promise((r) => setTimeout(r, 400));
          extracted = await extractIntakeText(mime, bytes, name);
        }
        if (extracted.extractable) {
          previewText = previewText.trim()
            ? `${previewText.trim()}\n\n${extracted.text}`
            : extracted.text;
        } else if (!previewText.trim()) {
          unread = true;
          unreadMessage = UNREAD_FILE_MESSAGE;
          if (extracted.note) console.warn('[intake preview]', extracted.note);
        }
      }
      if (!unread && !previewText.trim()) {
        unread = true;
        unreadMessage = UNREAD_FILE_MESSAGE;
      }
      const mapping = buildIntakeMappingPreview(previewText, {
        unread,
        unreadMessage,
      });
      return NextResponse.json({
        preview: true,
        posted: false,
        text: unread ? '' : previewText,
        unread,
        unread_message: unreadMessage,
        mapping,
      });
    }

    const builtList = entries?.length
      ? await buildIntakeDraftsFromEntries(entries, {
          source,
          filename,
          fromAddress,
          subject,
          mailbox,
          entryOffset,
          entryTotal: entryTotal || entries.length + entryOffset,
        })
      : await buildIntakeDrafts({
          text,
          source,
          filename,
          mimeType,
          bytes,
          fromAddress,
          subject,
          mailbox,
        });

    if (builtList.length > INTAKE_BATCH_SIZE && !entries?.length)
      throw new Error(
        `This file has many bookings. Upload through the intake window so it can process in batches of ${INTAKE_BATCH_SIZE}.`,
      );
    if ((entryTotal || builtList.length) > INTAKE_MAX_ENTRIES)
      throw new Error(`Intake supports up to ${INTAKE_MAX_ENTRIES.toLocaleString()} entries`);

    const db = await database();
    const drafts = [];
    for (let i = 0; i < builtList.length; i++) {
      const built = builtList[i];
      const id = i === 0 ? commandId : crypto.randomUUID();
      const result = await execute(db, actor, {
        id,
        kind: 'booking_draft',
        data: { title: built.title, entry: built.entry },
      });
      drafts.push({
        id: result.id,
        title: built.title,
        issues: built.issues,
        recognized_fields: built.recognized_fields,
      });
    }

    const processed = entryOffset + drafts.length;
    const total = entryTotal || drafts.length;

    return NextResponse.json(
      {
        id: drafts[0]?.id,
        title: drafts[0]?.title,
        count: drafts.length,
        drafts,
        entry_offset: entryOffset,
        entry_total: total,
        processed,
        remaining: Math.max(0, total - processed),
        done: processed >= total,
        batch_size: INTAKE_BATCH_SIZE,
        issues: drafts.flatMap((d) => d.issues).slice(0, 30),
        recognized_fields: drafts[0]?.recognized_fields ?? [],
        draft: true,
        posted: false,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(e instanceof Error ? e.message : 'Intake failed');
    console.error(message);
    return NextResponse.json(
      {
        error: databaseUnavailable(e)
          ? temporarilyUnavailable
          : message.includes('violates')
            ? 'Operation conflicts with an existing record or database constraint'
            : message,
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.startsWith('Permission required:')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
