import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { execute } from '@/lib/finance';
import { readJSON } from '@/lib/http';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import type { Actor } from '@/lib/permissions';
import { AccessError } from '@/lib/users';
import {
  assertWhatsAppBridgeAuth,
  prepareWhatsAppIntakeDraft,
  whatsappIntakeStatus,
} from '@/lib/whatsapp-intake';
import { afterIntakeDraftSaved } from '@/lib/intake-after-save';
import { aiIntakeStatus } from '@/lib/claude-intake';
import {
  confirmAssistantSave,
  findOpenAssistantDraft,
  formatAssistantOpsBriefing,
  formatAssistantProposal,
  isAssistantFollowUpText,
  isAssistantFreeChat,
  isAssistantGreetingText,
  isAssistantGuideQuestion,
  isAssistantOpsQuestion,
  isWaAssistantRequest,
  mergeAssistantFields,
  parseAssistantStaffReply,
  stampAssistantDraftEntry,
  waAssistantPhones,
} from '@/lib/wa-assistant';
import { collectOpsReminders } from '@/lib/ai-ops-reminders';
import {
  classifyStaffChatIntent,
  draftStaffChatReply,
  formatStaffFactReply,
  formatStaffGuideReply,
  formatStaffOpeningReply,
  padovaPageUrl,
  polishHumanChat,
} from '@/lib/wa-staff-chat';
import {
  isLikelyVoiceGreeting,
  mergeIntakeRawTexts,
  shouldMergeMediaIntoOpenDraft,
} from '@/lib/wa-intake-merge';
import { extractBinaryIntakeText } from '@/lib/intake-file-text';

async function resolveBridgeStaff(actor: Actor | null, actorId: unknown): Promise<Actor> {
  if (actor) return actor;
  if (!actorId) throw new Error('WhatsApp bridge posts require actor_id of staff user');
  const row = (
    await (
      await database()
    ).query('SELECT id, name, role, permissions FROM staff WHERE id=$1 AND active=true', [
      String(actorId),
    ])
  ).rows[0];
  if (!row) throw new Error('Bridge actor_id must be an active staff user');
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    permissions: row.permissions ?? [],
  };
}

export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    const bridge = request.headers.get('x-padova-wa-bridge');
    if (!actor && !bridge) throw new AccessError('Sign in required', 401);
    if (!actor && bridge) assertWhatsAppBridgeAuth(bridge);
    return NextResponse.json(
      {
        ...whatsappIntakeStatus(),
        assistant: {
          staff_only: true,
          default_on: true,
          bridge_claim_ok: true,
          phones_configured: waAssistantPhones().length,
          confirm_before_live: true,
          learn_patterns: true,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Unable to read WhatsApp intake status',
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}

/**
 * Incoming WhatsApp → draft (+ staff assistant Q&A / SAVE confirm).
 * Auth: staff session OR bridge token. Customer chats never get assistant replies.
 */
export async function POST(request: Request) {
  try {
    const bridge = request.headers.get('x-padova-wa-bridge');
    const actor = await currentActor();
    if (bridge) assertWhatsAppBridgeAuth(bridge);
    else {
      if (!actor) throw new AccessError('Sign in required', 401);
      validateOrigin(request);
    }
    if (!actor && !bridge) throw new AccessError('Sign in required', 401);

    const body = await readJSON(request, 20 * 1024 * 1024);
    type FilePart = { bytes: Buffer; filename: string; mime: string };
    const fileParts: FilePart[] = [];
    const pushFile = (b64raw: unknown, filename: unknown, mime: unknown) => {
      if (!b64raw) return;
      const raw = String(b64raw);
      const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 10 * 1024 * 1024) throw new Error('WhatsApp file must be 10 MB or smaller');
      if (!buf.length) return;
      fileParts.push({
        bytes: buf,
        filename: String(filename || `whatsapp-${fileParts.length + 1}`),
        mime: String(mime || 'application/octet-stream'),
      });
    };
    pushFile(body.file_base64, body.filename, body.mime_type);
    if (Array.isArray(body.files)) {
      for (const f of body.files.slice(0, 6)) {
        if (!f || typeof f !== 'object') continue;
        const row = f as Record<string, unknown>;
        pushFile(row.file_base64 || row.base64, row.filename, row.mime_type || row.mime);
      }
    }
    const bytes = fileParts[0]?.bytes;
    const primaryMime = fileParts[0]?.mime || (body.mime_type ? String(body.mime_type) : undefined);
    const primaryName = fileParts[0]?.filename || (body.filename ? String(body.filename) : undefined);

    const fromNumber = body.from_number ? String(body.from_number) : undefined;
    let text = String(body.text || '');
    // Bridge helper claims assistant (default on). Phone allowlist still works without claim.
    const staffAssistant = Boolean(bridge) && isWaAssistantRequest(fromNumber, body);
    const staff = await resolveBridgeStaff(actor, body.actor_id);
    const db = await database();

    // Instinct-style: OCR/transcribe parts in parallel (faster than one-by-one).
    const extractedParts: string[] = (
      await Promise.all(
        fileParts.map(async (part) => {
          const extracted = await extractBinaryIntakeText(part.mime, part.bytes, part.filename);
          return extracted.text?.trim() || '';
        }),
      )
    ).filter(Boolean);
    if (extractedParts.length) {
      const combined = mergeIntakeRawTexts(extractedParts);
      if (!text.trim()) text = combined;
      else text = mergeIntakeRawTexts([text, combined]);
    }

    // Voice note that is just "hi / how are you" → human chat, no booking draft.
    const audioOnly =
      fileParts.length > 0 &&
      fileParts.every(
        (p) =>
          p.mime.startsWith('audio/') ||
          /\.(ogg|opus|mp3|m4a|wav|webm|aac|oga)$/i.test(p.filename),
      );
    if (staffAssistant && audioOnly && isLikelyVoiceGreeting(text)) {
      const opening = formatStaffOpeningReply(text);
      return NextResponse.json(
        {
          assistant: true,
          assistant_reply_text: opening.text,
          assistant_intent: 'smalltalk',
          voice_greeting: true,
          customer_status_text: null,
          owner_alert_text: null,
          posts_money: false,
          invents_amounts: false,
          ai: aiIntakeStatus(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // —— Staff chat: English only, DB facts, no spam digests, fast path (no LLM delay) ——
    if (
      staffAssistant &&
      !fileParts.length &&
      (isAssistantGreetingText(text) ||
        isAssistantOpsQuestion(text) ||
        isAssistantGuideQuestion(text) ||
        isAssistantFreeChat(text))
    ) {
      const intent = classifyStaffChatIntent(text);
      let reply = '';
      let usedAi = false;

      if (intent === 'greeting' || intent === 'smalltalk' || intent === 'menu') {
        reply = formatStaffOpeningReply(text).text;
      } else if (intent === 'guide') {
        reply = formatStaffGuideReply(text);
      } else {
        // Every real question → DB facts first (correct results), then optional LLM polish.
        try {
          const reminders = await collectOpsReminders(db, staff);
          const open = await findOpenAssistantDraft(db, fromNumber || '');
          const factReply =
            intent === 'ops' || intent === 'report' || intent === 'chat'
              ? formatStaffFactReply({
                  question: text,
                  as_of: reminders.as_of,
                  counts: reminders.counts,
                  items: reminders.items,
                  openDraft: open
                    ? { id: open.id, title: open.title || open.id }
                    : null,
                })
              : formatAssistantOpsBriefing({
                  as_of: reminders.as_of,
                  counts: reminders.counts,
                  items: reminders.items,
                  full: intent === 'report',
                });
          reply = factReply;
          // Prefer grounded AI when keys exist; never invent money (system prompt).
          const allowLlm =
            /^(1|true|yes)$/i.test(String(process.env.PADOVA_WA_CHAT_LLM || '').trim()) ||
            /^(1|true|yes)$/i.test(String(process.env.PADOVA_AI_INTAKE || '').trim()) ||
            Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
          if (allowLlm && intent === 'chat') {
            const drafted = await draftStaffChatReply({
              question: text,
              intent: 'chat',
              contextBlock: [
                reminders.plain_summary,
                open
                  ? `Open draft for this chat: ${open.title || open.id} (not live until SAVE).`
                  : 'No open assistant draft for this chat.',
              ].join('\n'),
              fallback: factReply,
            });
            reply = drafted.text;
            usedAi = drafted.used_ai;
          }
        } catch {
          reply = polishHumanChat(
            `I could not read Padova right now. Try Attention: ${padovaPageUrl('Attention')} or send the reservation file.`,
          );
        }
      }

      return NextResponse.json(
        {
          assistant: true,
          assistant_reply_text: reply,
          assistant_intent: intent,
          assistant_used_ai: usedAi,
          customer_status_text: null,
          owner_alert_text: null,
          posts_money: false,
          invents_amounts: false,
          ai: aiIntakeStatus(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // —— Staff assistant follow-up (SAVE / field answers) ——
    if (staffAssistant && !bytes?.length && isAssistantFollowUpText(text)) {
      const open =
        (body.draft_id
          ? (
              await db.query(`SELECT id, title, entry FROM booking_drafts WHERE id=$1`, [
                String(body.draft_id),
              ])
            ).rows[0]
          : null) || (await findOpenAssistantDraft(db, fromNumber || ''));
      if (!open) {
        return NextResponse.json(
          {
            assistant: true,
            assistant_reply_text:
              "I don't have an open draft in this chat yet. Send a reservation (PDF, screenshot, or confirmation text) and I'll start one.",
            customer_status_text: null,
            owner_alert_text: null,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const draft = {
        id: String(open.id),
        title: String(open.title || ''),
        entry: (body.entry && typeof body.entry === 'object'
          ? body.entry
          : open.entry || {}) as Record<string, unknown>,
      };
      const parsed = parseAssistantStaffReply(text);
      if (parsed.kind === 'cancel') {
        return NextResponse.json({
          assistant: true,
          id: draft.id,
          assistant_reply_text: polishHumanChat(
            `Okay, left as a draft. Finish later under Bookings → Drafts: ${padovaPageUrl('Bookings')}`,
          ),
          customer_status_text: null,
        });
      }
      let entry = draft.entry;
      if (parsed.kind === 'fields') {
        entry = mergeAssistantFields(entry, parsed.fields, text);
      }
      if (parsed.kind === 'save' || (parsed.kind === 'fields' && /save/i.test(text))) {
        const result = await confirmAssistantSave(db, staff, { ...draft, entry }, text);
        return NextResponse.json({
          assistant: true,
          id: draft.id,
          live_booking: result.live,
          booking_id: result.booking_id,
          booking_code: result.booking_code,
          assistant_reply_text: result.reply,
          entry: result.entry,
          customer_status_text: null,
          ai: aiIntakeStatus(),
        });
      }
      // Field patch only — return refreshed proposal (helper keeps entry session).
      return NextResponse.json({
        assistant: true,
        id: draft.id,
        title: draft.title,
        entry,
        assistant_reply_text: formatAssistantProposal({
          draft_id: draft.id,
          title: draft.title,
          entry,
        }),
        customer_status_text: null,
      });
    }

    // Same-chat multi-screenshot continuity: fold into open assistant draft when fingerprints match.
    let supersededDraftId: string | undefined;
    if (staffAssistant && (fileParts.length > 0 || text.trim())) {
      const open = await findOpenAssistantDraft(db, fromNumber || '');
      if (open) {
        const openRaw = String(
          open.entry.intake_raw_text || open.entry.recovery_paste || open.title || '',
        );
        const createdAt =
          (open.entry.itinerary as { wa_assistant_started?: string } | undefined)
            ?.wa_assistant_started ||
          open.created_at ||
          null;
        const chatKey = body.chat_name
          ? String(body.chat_name)
          : fromNumber
            ? String(fromNumber)
            : '';
        if (
          shouldMergeMediaIntoOpenDraft({
            openRawText: openRaw,
            openCreatedAt: createdAt,
            newText: text,
            openChat: chatKey,
            newChat: chatKey,
          })
        ) {
          text = mergeIntakeRawTexts([openRaw, text]);
          supersededDraftId = open.id;
          try {
            await execute(db, staff, {
              id: crypto.randomUUID(),
              kind: 'booking_draft_delete',
              data: { draft_id: open.id },
            });
          } catch {
            /* best-effort soft discard of superseded partial draft */
          }
        }
      }
    }

    // Prefer combined OCR text as the booking source; keep one media part for provenance.
    const built = await prepareWhatsAppIntakeDraft({
      session_label: body.session_label ? String(body.session_label) : undefined,
      chat_name: body.chat_name ? String(body.chat_name) : undefined,
      from_number: fromNumber,
      text,
      received_at: body.received_at ? String(body.received_at) : undefined,
      message_id: body.message_id ? String(body.message_id) : undefined,
      // When multi-file OCR already filled text, avoid re-OCR of only the first image.
      bytes: extractedParts.length >= 2 ? undefined : bytes,
      filename: primaryName,
      mimeType: primaryMime,
    });

    if (staffAssistant) {
      built.entry = stampAssistantDraftEntry(built.entry, {
        from_number: fromNumber,
        raw_text: text || built.title,
        message_id: body.message_id ? String(body.message_id) : undefined,
      });
      if (fileParts.length > 1 || supersededDraftId) {
        const itinerary = {
          ...((built.entry.itinerary as Record<string, unknown>) || {}),
          wa_media_parts: fileParts.length || 1,
          wa_merged_screenshots: true,
          wa_superseded_draft_id: supersededDraftId || null,
        };
        built.entry.itinerary = itinerary;
        built.issues = [
          ...(built.issues || []),
          fileParts.length > 1
            ? `Merged ${fileParts.length} screenshots into one draft (same booking).`
            : 'Merged with earlier screenshot draft from this chat (same booking).',
        ];
      }
    }

    const commandId = String(body.command_id || crypto.randomUUID());
    const result = await execute(db, staff, {
      id: commandId,
      kind: 'booking_draft',
      data: { title: built.title, entry: built.entry },
    });
    const after = await afterIntakeDraftSaved(db, staff, String(result.id), built, {
      channel: 'whatsapp',
      chat_or_mailbox: body.chat_name
        ? String(body.chat_name)
        : fromNumber
          ? fromNumber
          : undefined,
      skipPromote: staffAssistant,
    });
    const promote = after.promote;

    const assistant_reply_text = staffAssistant
      ? polishHumanChat(
          [
            fileParts.length > 1 || supersededDraftId
              ? `Got those screenshots. I treated them as one booking, not ${
                  fileParts.length > 1 ? fileParts.length : 'separate'
                }.`
              : '',
            formatAssistantProposal({
              draft_id: String(result.id),
              title: built.title,
              entry: built.entry,
              recognized_fields: built.recognized_fields,
              extract: after.capture.extract,
            }),
          ]
            .filter(Boolean)
            .join('\n\n'),
        )
      : null;

    return NextResponse.json(
      {
        id: result.id,
        title: built.title,
        issues: built.issues,
        recognized_fields: built.recognized_fields,
        draft: true,
        posted: false,
        posts_money: false,
        sent: false,
        live_booking: promote.live,
        booking_id: promote.live ? promote.booking_id : undefined,
        booking_code: promote.live ? promote.booking_code : undefined,
        ai_summary: promote.summary,
        ai_created: after.capture.ai_generated || staffAssistant,
        ai_promote_reason: promote.live ? undefined : promote.reason,
        intake_tags: after.capture.tags,
        intake_confidence: after.capture.confidence,
        intake_missing: after.capture.missing,
        // Never push technical intake-alert spam on WhatsApp; staff can ask for a report.
        owner_alert_text: null,
        customer_status_text: null,
        assistant: staffAssistant,
        assistant_reply_text,
        entry: built.entry,
        merged_screenshots: Boolean(fileParts.length > 1 || supersededDraftId),
        media_parts: fileParts.length || 0,
        intake: whatsappIntakeStatus(),
        ai: aiIntakeStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'WhatsApp intake failed',
    );
    console.error(message);
    const chatter = /chatter skipped|unrelated skipped|does not look like a booking/i.test(
      message,
    );
    return NextResponse.json(
      {
        error: databaseUnavailable(e)
          ? temporarilyUnavailable
          : message.includes('violates')
            ? 'Operation conflicts with an existing record or database constraint'
            : message,
        owner_alert_text: null,
        skipped_chatter: chatter,
        customer_status_text: null,
        assistant_reply_text: null,
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.startsWith('Permission required:') || message.includes('authorization rejected')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
