import { buildIntakeDraft } from './booking-intake';
import type { Database } from './db';
import type { Actor } from './permissions';

export type InboundInstinctMessage = {
  /** Instinct chat / thread label — provenance only. */
  chat_name?: string;
  from_number?: string;
  text: string;
  received_at?: string;
  message_id?: string;
  title?: string;
};

/**
 * Stage 1 Instinct → Padova: Owner messages Instinct on WhatsApp;
 * Instinct calls Padova HTTP with a server token. Draft only — never money, never auto-send.
 */
export function instinctIntakeStatus() {
  const token = process.env.PADOVA_INSTINCT_TOKEN?.trim();
  const actorId = process.env.PADOVA_INSTINCT_ACTOR_ID?.trim();
  return {
    mode: token ? 'instinct_token_present' : 'awaiting_instinct_token',
    read_only: true,
    auto_send: false,
    posts_money: false,
    live_booking: false,
    draft_only: true,
    actor_configured: Boolean(actorId),
    note: token
      ? 'Instinct token is set. Agent may POST reservation text → booking_draft. Staff must approve before live books. Never invent amounts.'
      : 'Set PADOVA_INSTINCT_TOKEN (+ PADOVA_INSTINCT_ACTOR_ID) on the host, then give Instinct the QA URL + header token.',
  };
}

export function assertInstinctAuth(headerToken: string | null | undefined) {
  const expected = process.env.PADOVA_INSTINCT_TOKEN?.trim();
  if (!expected) throw new Error('Instinct intake is not configured (missing token)');
  if (!headerToken || headerToken !== expected) throw new Error('Instinct authorization rejected');
}

/** Extract bearer or x-padova-instinct header value. */
export function readInstinctAuthHeader(request: Request): string | null {
  const custom = request.headers.get('x-padova-instinct');
  if (custom?.trim()) return custom.trim();
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

/** Build draft from Instinct-forwarded text. Does not write to the database. */
export async function prepareInstinctIntakeDraft(message: InboundInstinctMessage) {
  if (!message.text?.trim()) throw new Error('Instinct intake requires message text');
  const built = await buildIntakeDraft({
    source: 'instinct',
    text: message.text,
    subject: message.chat_name,
    fromAddress: message.from_number,
    receivedAt: message.received_at,
    filename: message.message_id
      ? `instinct:${message.message_id}`
      : message.chat_name
        ? `instinct-chat:${message.chat_name}`
        : undefined,
    mimeType: 'text/plain',
  });
  if (message.title?.trim()) {
    return { ...built, title: message.title.trim() };
  }
  return built;
}

/** Resolve staff for Instinct token posts: body/env id, else first active Owner. */
export async function resolveInstinctActor(
  db: Database,
  preferredId?: string | null,
): Promise<Actor> {
  const actorId = preferredId?.trim() || process.env.PADOVA_INSTINCT_ACTOR_ID?.trim() || '';
  if (actorId) {
    const row = (
      await db.query(
        'SELECT id, name, role, permissions FROM staff WHERE id=$1 AND active=true',
        [actorId],
      )
    ).rows[0];
    if (!row) throw new Error('Instinct actor_id must be an active staff user');
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      permissions: row.permissions ?? [],
    };
  }
  const owner = (
    await db.query(
      `SELECT id, name, role, permissions FROM staff
       WHERE active=true AND role='Owner'
       ORDER BY created_at ASC NULLS LAST, name ASC
       LIMIT 1`,
    )
  ).rows[0];
  if (!owner)
    throw new Error(
      'Instinct posts require PADOVA_INSTINCT_ACTOR_ID or an active Owner staff user',
    );
  return {
    id: owner.id,
    name: owner.name,
    role: owner.role,
    permissions: owner.permissions ?? [],
  };
}

/** Minimal MCP tool list for Instinct remote MCP connection. */
export function instinctMcpTools() {
  return [
    {
      name: 'padova_instinct_status',
      description:
        'Check Padova Instinct intake readiness. Draft-only; never posts money or live bookings.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: 'padova_create_booking_draft',
      description:
        'Create a Padova booking DRAFT from reservation text (Field:Value lines). Never invent sale/cost/payment amounts. Staff must approve in Padova before it is a live booking. Do not post money.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Reservation paste or Field:Value lines. Leave unknown money blank.',
          },
          title: { type: 'string' },
          chat_name: { type: 'string' },
          from_number: { type: 'string' },
          message_id: { type: 'string' },
          command_id: { type: 'string', format: 'uuid' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

export async function handleInstinctMcp(
  db: Database,
  authorizationHeader: string | null,
  input: unknown,
) {
  const token =
    authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ||
    authorizationHeader?.trim() ||
    null;
  assertInstinctAuth(token);

  const request = input as {
    jsonrpc?: string;
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
  };
  if (request.jsonrpc !== '2.0') throw new Error('MCP requires jsonrpc 2.0');
  if (request.id === undefined && request.method !== 'notifications/initialized')
    throw new Error('A JSON-RPC request ID is required');
  const method = String(request.method || '');
  let result: unknown;
  if (method === 'initialize')
    result = {
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'padova-instinct', version: '1.0.0' },
      instructions:
        'Padova Stage 1 Instinct intake. Only create booking drafts. Never invent money. Never post payments or live bookings. Ask the Owner to confirm facts, then call padova_create_booking_draft. Tell them staff must approve in Padova.',
    };
  else if (method === 'notifications/initialized') return null;
  else if (method === 'ping') result = {};
  else if (method === 'tools/list') result = { tools: instinctMcpTools() };
  else if (method === 'tools/call') {
    const name = String(request.params?.name || '');
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
    if (name === 'padova_instinct_status') {
      result = { content: [{ type: 'text', text: JSON.stringify(instinctIntakeStatus()) }] };
    } else if (name === 'padova_create_booking_draft') {
      const { execute } = await import('./finance');
      const built = await prepareInstinctIntakeDraft({
        text: String(args.text || ''),
        title: args.title ? String(args.title) : undefined,
        chat_name: args.chat_name ? String(args.chat_name) : undefined,
        from_number: args.from_number ? String(args.from_number) : undefined,
        message_id: args.message_id ? String(args.message_id) : undefined,
      });
      const staff = await resolveInstinctActor(db, null);
      const commandId = String(args.command_id || crypto.randomUUID());
      const saved = await execute(db, staff, {
        id: commandId,
        kind: 'booking_draft',
        data: { title: built.title, entry: built.entry },
      });
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: saved.id,
              title: built.title,
              issues: built.issues,
              recognized_fields: built.recognized_fields,
              draft: true,
              posted: false,
              live_booking: false,
              posts_money: false,
              note: 'Draft created. Staff must approve in Padova before live booking.',
            }),
          },
        ],
      };
    } else throw new Error(`Unknown Instinct MCP tool: ${name}`);
  } else throw new Error(`Unsupported MCP method: ${method}`);

  return { jsonrpc: '2.0', id: request.id, result };
}
