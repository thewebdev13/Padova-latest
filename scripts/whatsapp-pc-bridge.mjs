#!/usr/bin/env node
/**
 * Padova WhatsApp PC bridge (read-only → booking_draft).
 *
 * Owner scope: run on the Owner PC; read incoming chat text only; never send;
 * create drafts for staff approval. Official Meta Cloud API is out of scope.
 *
 * Folder/stdin helper only. For live WhatsApp Web QR linking on this PC, use
 * `npm run intake:whatsapp-web` (scripts/whatsapp-web-reader.mjs) — still
 * read-only, never sends. Unofficial linked session = residual ToS/ban risk.
 *
 * Required env:
 *   PADOVA_WHATSAPP_BRIDGE_TOKEN  — same token as the Padova server
 *   PADOVA_WHATSAPP_BRIDGE_URL    — e.g. https://qa.padovatravel.com/api/booking-intake/whatsapp
 *   PADOVA_WHATSAPP_ACTOR_ID     — active staff UUID that owns the draft attribution
 *
 * Optional:
 *   PADOVA_WHATSAPP_INBOX_DIR    — folder to watch (default .data/whatsapp-inbox)
 *   PADOVA_WHATSAPP_STATE_FILE   — processed ids (default .data/whatsapp-bridge-state.json)
 *
 * Usage:
 *   node scripts/whatsapp-pc-bridge.mjs check
 *   node scripts/whatsapp-pc-bridge.mjs once
 *   node scripts/whatsapp-pc-bridge.mjs watch
 *   echo '{"text":"Product: Hotel\\nRoute: Miami","chat_name":"Guest"}' | node scripts/whatsapp-pc-bridge.mjs stdin
 *
 * Loads ignored .env.local from the project root when present (does not print secrets).
 */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i <= 0) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

await loadEnvFile(path.join(root, '.env.local'));

const token = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
const url = process.env.PADOVA_WHATSAPP_BRIDGE_URL?.trim();
const actorId = process.env.PADOVA_WHATSAPP_ACTOR_ID?.trim();
const inboxDir =
  process.env.PADOVA_WHATSAPP_INBOX_DIR?.trim() ||
  path.resolve(root, '.data/whatsapp-inbox');
const stateFile =
  process.env.PADOVA_WHATSAPP_STATE_FILE?.trim() ||
  path.resolve(root, '.data/whatsapp-bridge-state.json');

function fail(message) {
  console.error(`[whatsapp-pc-bridge] ${message}`);
  process.exit(1);
}

async function runCheck() {
  const missing = [];
  if (!token) missing.push('PADOVA_WHATSAPP_BRIDGE_TOKEN');
  if (!url) missing.push('PADOVA_WHATSAPP_BRIDGE_URL');
  if (!actorId) missing.push('PADOVA_WHATSAPP_ACTOR_ID');
  console.log('[check] read-only WhatsApp → draft bridge');
  console.log(`[check] inbox: ${inboxDir}`);
  console.log(`[check] url: ${url || '(missing)'}`);
  console.log(`[check] actor_id: ${actorId ? `${actorId.slice(0, 8)}…` : '(missing)'}`);
  console.log(`[check] token: ${token ? 'set' : 'missing'}`);
  if (missing.length) {
    console.log('[check] FAIL missing:', missing.join(', '));
    console.log(
      '[check] tip: put the same token in server .env.local / QA Vercel env, then export URL + actor id (or add to .env.local).',
    );
    console.log(
      `[check] tip: sample token (generate your own): ${randomBytes(24).toString('base64url')}`,
    );
    process.exit(1);
  }
  await fs.mkdir(inboxDir, { recursive: true });
  try {
    const response = await fetch(url, {
      headers: { 'x-padova-wa-bridge': token },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    console.log('[check] server status OK');
    console.log(
      `[check] mode=${body.mode} read_only=${body.read_only} auto_send=${body.auto_send} posts_money=${body.posts_money}`,
    );
    console.log('[check] PASS — drop .txt/.json into the inbox, then run: once | watch');
  } catch (err) {
    fail(`server check failed: ${err instanceof Error ? err.message : err}`);
  }
}

const mode = process.argv[2] || 'once';
if (mode === 'check') {
  await runCheck();
  process.exit(0);
}
if (!['once', 'watch', 'stdin'].includes(mode))
  fail(`Unknown mode "${mode}". Use check | once | watch | stdin`);

if (!token) fail('Set PADOVA_WHATSAPP_BRIDGE_TOKEN');
if (!url) fail('Set PADOVA_WHATSAPP_BRIDGE_URL to POST /api/booking-intake/whatsapp');
if (!actorId) fail('Set PADOVA_WHATSAPP_ACTOR_ID to an active staff UUID');

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch {
    return { processed: {} };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

function messageIdFor(payload, sourceHint) {
  if (payload.message_id) return String(payload.message_id);
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        sourceHint,
        text: payload.text,
        chat_name: payload.chat_name,
        from_number: payload.from_number,
        received_at: payload.received_at,
      }),
    )
    .digest('hex')
    .slice(0, 32);
  return `wa-file:${digest}`;
}

async function postDraft(payload, sourceHint) {
  const message_id = messageIdFor(payload, sourceHint);
  const state = await loadState();
  if (state.processed[message_id]) {
    console.log(`[skip] already processed ${message_id}`);
    return state.processed[message_id];
  }
  const body = {
    ...payload,
    message_id,
    actor_id: actorId,
    command_id: crypto.randomUUID(),
    session_label: payload.session_label || 'owner-pc-inbox',
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-padova-wa-bridge': token,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  state.processed[message_id] = {
    id: result.id,
    title: result.title,
    at: new Date().toISOString(),
  };
  await saveState(state);
  console.log(`[draft] ${result.id} — ${result.title || 'intake'} (${message_id})`);
  return state.processed[message_id];
}

function parseFileContent(name, raw) {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  if (/\.jsonl$/i.test(name)) {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  if (/\.json$/i.test(name)) {
    const data = JSON.parse(trimmed);
    return Array.isArray(data) ? data : [data];
  }
  return [
    {
      text: trimmed,
      chat_name: path.basename(name, path.extname(name)),
      received_at: new Date().toISOString(),
    },
  ];
}

async function processInboxOnce() {
  await fs.mkdir(inboxDir, { recursive: true });
  const names = (await fs.readdir(inboxDir)).filter((n) =>
    /\.(txt|md|json|jsonl)$/i.test(n),
  );
  let count = 0;
  for (const name of names) {
    const full = path.join(inboxDir, name);
    const raw = await fs.readFile(full, 'utf8');
    const messages = parseFileContent(name, raw) || [];
    for (const message of messages) {
      if (!message?.text?.trim()) continue;
      await postDraft(message, full);
      count += 1;
    }
    const doneDir = path.join(inboxDir, 'processed');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.rename(full, path.join(doneDir, `${Date.now()}-${name}`));
  }
  return count;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) fail('stdin was empty');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { text: raw, chat_name: 'stdin', received_at: new Date().toISOString() };
  }
  if (!payload.text?.trim()) fail('JSON stdin requires text');
  await postDraft(payload, 'stdin');
}

if (mode === 'stdin') {
  await readStdin();
} else if (mode === 'watch') {
  console.log(`[watch] inbox ${inboxDir} → ${url} (read-only drafts, never send)`);
  for (;;) {
    try {
      const n = await processInboxOnce();
      if (n) console.log(`[watch] posted ${n} draft(s)`);
    } catch (err) {
      console.error(`[watch] ${err instanceof Error ? err.message : err}`);
    }
    await sleep(5000);
  }
} else {
  const n = await processInboxOnce();
  console.log(`[once] processed ${n} message(s) from ${inboxDir}`);
}
