import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { collectOpsReminders } from '@/lib/ai-ops-reminders';
import { formatOwnerReminderDigest } from '@/lib/ai-reminder-digest';
import { aiIntakeStatus } from '@/lib/claude-intake';
import { assertWhatsAppBridgeAuth } from '@/lib/whatsapp-intake';
import { redactOperationalText } from '@/lib/operational-redaction';
import { databaseUnavailable, temporarilyUnavailable } from '@/lib/service-errors';
import type { Actor } from '@/lib/permissions';
import { AccessError } from '@/lib/users';

/**
 * PC Baileys helper polls this with bridge token + actor_id.
 * Returns an Owner digest only — never posts money, never targets customers.
 */
export async function GET(request: Request) {
  try {
    assertWhatsAppBridgeAuth(request.headers.get('x-padova-wa-bridge'));
    const url = new URL(request.url);
    const actorId = url.searchParams.get('actor_id')?.trim();
    if (!actorId) throw new Error('actor_id of active staff is required');

    const row = (
      await (
        await database()
      ).query('SELECT id, name, role, permissions FROM staff WHERE id=$1 AND active=true', [
        actorId,
      ])
    ).rows[0];
    if (!row) throw new Error('actor_id must be an active staff user');

    const staff: Actor = {
      id: row.id,
      name: row.name,
      role: row.role,
      permissions: row.permissions ?? [],
    };

    const reminders = await collectOpsReminders(await database(), staff);
    const digest = formatOwnerReminderDigest({
      as_of: reminders.as_of,
      items: reminders.items,
      plain_summary: reminders.plain_summary,
    });

    return NextResponse.json(
      {
        as_of: reminders.as_of,
        counts: reminders.counts,
        item_count: digest.count,
        fingerprint: digest.fingerprint,
        text: digest.text,
        send_to_customers: false,
        posts_money: false,
        invents_amounts: false,
        ai: aiIntakeStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = redactOperationalText(
      e instanceof Error ? e.message : 'Unable to load reminder digest',
    );
    return NextResponse.json(
      {
        error: databaseUnavailable(e) ? temporarilyUnavailable : message,
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : message.includes('authorization rejected') || message.startsWith('Permission required:')
              ? 403
              : databaseUnavailable(e)
                ? 503
                : 400,
      },
    );
  }
}
