#!/usr/bin/env node
/**
 * Padova WhatsApp Web QR helper (Baileys — unofficial PC link).
 *
 * Links a multi-device WhatsApp session on this PC (scan QR like WhatsApp Web),
 * reads inbound reservation text / PDF / images / voice notes → Padova booking_draft.
 * Reacts + short status reply after filing (no invented money).
 *
 * Optional Owner-only alerts (professional / allowlisted):
 *   allow_owner_alerts=true + owner_phones in helper config
 *   Polls GET /api/ai/reminders/bridge and sendMessage ONLY to those numbers.
 *   Still never invents money; never targets customer chats.
 *
 * Local browser page (same PC only):
 *   http://127.0.0.1:3927/
 * Open that URL while this script is running → scan QR on the page.
 * Not a public internet login URL — WhatsApp session stays on this PC
 * (Owner scope). Public/cloud hosted QR would mean the session lives on a
 * server; that is out of scope unless Owner reverses the PC-only plan.
 *
 * Required env (same as folder bridge):
 *   PADOVA_WHATSAPP_BRIDGE_TOKEN
 *   PADOVA_WHATSAPP_BRIDGE_URL
 *   PADOVA_WHATSAPP_ACTOR_ID
 *
 * Optional:
 *   PADOVA_WHATSAPP_AUTH_DIR
 *   PADOVA_WHATSAPP_STATE_FILE
 *   PADOVA_WHATSAPP_SESSION_LABEL
 *   PADOVA_WHATSAPP_UI_PORT   — default 3927
 *   PADOVA_WHATSAPP_UI_HOST   — default 127.0.0.1 (localhost only)
 *
 * Usage:
 *   npm run intake:whatsapp-web
 *   node scripts/whatsapp-web-reader.mjs logout
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';

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

/** Simple JSON config for non-tech Owner PC (never commit real tokens). */
async function loadHelperConfig() {
  const candidates = [
    process.env.PADOVA_WHATSAPP_HELPER_CONFIG?.trim(),
    path.join(root, '.data/whatsapp-helper-config.json'),
    path.join(root, 'scripts/whatsapp-pc-helper/config.json'),
  ].filter(Boolean);
  for (const filePath of candidates) {
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!data || typeof data !== 'object') continue;
      const map = {
        token: 'PADOVA_WHATSAPP_BRIDGE_TOKEN',
        url: 'PADOVA_WHATSAPP_BRIDGE_URL',
        actor_id: 'PADOVA_WHATSAPP_ACTOR_ID',
        auth_dir: 'PADOVA_WHATSAPP_AUTH_DIR',
        state_file: 'PADOVA_WHATSAPP_STATE_FILE',
        session_label: 'PADOVA_WHATSAPP_SESSION_LABEL',
        ui_port: 'PADOVA_WHATSAPP_UI_PORT',
        reminders_url: 'PADOVA_WHATSAPP_REMINDERS_URL',
        allow_owner_alerts: 'PADOVA_WHATSAPP_ALLOW_OWNER_ALERTS',
        alert_interval_minutes: 'PADOVA_WHATSAPP_ALERT_INTERVAL_MINUTES',
        reply_intake_status: 'PADOVA_WHATSAPP_REPLY_INTAKE_STATUS',
        react_on_seen: 'PADOVA_WHATSAPP_REACT_ON_SEEN',
      };
      for (const [from, envKey] of Object.entries(map)) {
        const value = data[from];
        if (value == null || value === '') continue;
        if (!(envKey in process.env) || !String(process.env[envKey] || '').trim()) {
          process.env[envKey] = String(value);
        }
      }
      if (Array.isArray(data.owner_phones) && data.owner_phones.length) {
        const joined = data.owner_phones.map(String).join(',');
        if (!String(process.env.PADOVA_WHATSAPP_OWNER_PHONES || '').trim()) {
          process.env.PADOVA_WHATSAPP_OWNER_PHONES = joined;
        }
      }
      console.log(`[whatsapp-web-reader] config: ${filePath}`);
      return;
    } catch {
      /* try next */
    }
  }
}

await loadHelperConfig();

const token = process.env.PADOVA_WHATSAPP_BRIDGE_TOKEN?.trim();
const url = process.env.PADOVA_WHATSAPP_BRIDGE_URL?.trim();
const actorId = process.env.PADOVA_WHATSAPP_ACTOR_ID?.trim();
const authDir =
  process.env.PADOVA_WHATSAPP_AUTH_DIR?.trim() ||
  path.resolve(root, '.data/whatsapp-web-auth');
const stateFile =
  process.env.PADOVA_WHATSAPP_STATE_FILE?.trim() ||
  path.resolve(root, '.data/whatsapp-bridge-state.json');
const sessionLabel =
  process.env.PADOVA_WHATSAPP_SESSION_LABEL?.trim() || 'pc-web-reader';
const uiPort = Number(process.env.PADOVA_WHATSAPP_UI_PORT || 3927);
const uiHost = process.env.PADOVA_WHATSAPP_UI_HOST?.trim() || '127.0.0.1';
const openBrowser = process.env.PADOVA_WHATSAPP_OPEN_BROWSER !== '0';
const allowOwnerAlerts = /^(1|true|yes)$/i.test(
  String(process.env.PADOVA_WHATSAPP_ALLOW_OWNER_ALERTS || '').trim(),
);
/** React 👀 when a reservation message is seen (default on). */
const reactOnSeen = !/^(0|false|no)$/i.test(
  String(process.env.PADOVA_WHATSAPP_REACT_ON_SEEN || 'true').trim(),
);
/**
 * Short intake status reply after filing (default off — do not message users).
 * Opt-in via reply_intake_status: true. Status only — never invents money.
 */
const replyIntakeStatus = /^(1|true|yes)$/i.test(
  String(process.env.PADOVA_WHATSAPP_REPLY_INTAKE_STATUS || 'false').trim(),
);
const ownerPhones = String(process.env.PADOVA_WHATSAPP_OWNER_PHONES || '')
  .split(/[,;\s]+/)
  .map((p) => p.replace(/\D/g, ''))
  .filter((p) => p.length >= 8 && p.length <= 15);
const alertIntervalMinutes = Math.max(
  30,
  Number(process.env.PADOVA_WHATSAPP_ALERT_INTERVAL_MINUTES || 240) || 240,
);
const remindersUrl =
  process.env.PADOVA_WHATSAPP_REMINDERS_URL?.trim() ||
  (url
    ? String(url).replace(/\/api\/booking-intake\/whatsapp\/?$/i, '/api/ai/reminders/bridge')
    : '');
const mode = process.argv[2] || 'run';

const logger = pino({ level: 'silent' });

/** Live UI/status shared with the local browser page. */
const live = {
  status: 'starting',
  detail: 'Starting WhatsApp link…',
  qrDataUrl: null,
  draftsPosted: 0,
  lastDraftAt: null,
  lastChat: null,
  updatedAt: new Date().toISOString(),
};

function setLive(patch) {
  Object.assign(live, patch, { updatedAt: new Date().toISOString() });
}

function fail(message) {
  console.error(`[whatsapp-web-reader] ${message}`);
  process.exit(1);
}

function requireConfig() {
  const missing = [];
  if (!token) missing.push('PADOVA_WHATSAPP_BRIDGE_TOKEN');
  if (!url) missing.push('PADOVA_WHATSAPP_BRIDGE_URL');
  if (!actorId) missing.push('PADOVA_WHATSAPP_ACTOR_ID');
  if (missing.length) fail(`missing env: ${missing.join(', ')}`);
}

async function loadState() {
  try {
    const raw = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    return {
      processed: raw.processed || {},
      last_alert_fingerprint: raw.last_alert_fingerprint || null,
      last_alert_at: raw.last_alert_at || null,
    };
  } catch {
    return { processed: {}, last_alert_fingerprint: null, last_alert_at: null };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const keys = Object.keys(state.processed || {});
  if (keys.length > 4000) {
    const keep = keys.slice(-2000);
    state.processed = Object.fromEntries(keep.map((k) => [k, state.processed[k]]));
  }
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function phoneToJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

async function fetchOwnerDigest() {
  if (!remindersUrl || !token || !actorId) return null;
  const endpoint = new URL(remindersUrl);
  endpoint.searchParams.set('actor_id', actorId);
  const response = await fetch(endpoint, {
    headers: {
      'x-padova-wa-bridge': token,
      accept: 'application/json',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `reminders HTTP ${response.status}`);
  }
  return body;
}

/**
 * Owner-only digest send. Never customers. Deduped by fingerprint + interval.
 */
async function maybeSendOwnerAlerts(sock, processed) {
  if (!allowOwnerAlerts) return;
  if (!ownerPhones.length) {
    console.warn(
      '[whatsapp-web-reader] owner alerts on but owner_phones empty — skip send',
    );
    return;
  }
  if (!sock) return;

  const now = Date.now();
  const lastAt = processed.last_alert_at ? Date.parse(processed.last_alert_at) : 0;
  if (lastAt && now - lastAt < alertIntervalMinutes * 60_000) return;

  const digest = await fetchOwnerDigest();
  if (!digest?.text) return;
  if (!digest.item_count) {
    // Quiet when empty — still advance interval so we do not hammer API.
    processed.last_alert_at = new Date().toISOString();
    processed.last_alert_fingerprint = digest.fingerprint || 'empty';
    await saveState(processed);
    return;
  }
  if (
    digest.fingerprint &&
    digest.fingerprint === processed.last_alert_fingerprint &&
    lastAt &&
    now - lastAt < alertIntervalMinutes * 60_000 * 2
  ) {
    return;
  }

  for (const phone of ownerPhones) {
    const jid = phoneToJid(phone);
    if (!jid) continue;
    await sock.sendMessage(jid, { text: String(digest.text) });
    console.log(`[owner-alert] sent digest (${digest.item_count} items) → ${phone}`);
  }
  processed.last_alert_fingerprint = digest.fingerprint || null;
  processed.last_alert_at = new Date().toISOString();
  await saveState(processed);
  setLive({
    detail: `Listening. Owner alert sent (${digest.item_count} items).`,
  });
}

function messageKeyId(msg) {
  const remote = msg.key?.remoteJid || '';
  const id = msg.key?.id || '';
  const fromMe = msg.key?.fromMe ? '1' : '0';
  return createHash('sha256').update(`${remote}|${id}|${fromMe}`).digest('hex');
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return '';
  if (m.conversation) return String(m.conversation);
  if (m.extendedTextMessage?.text) return String(m.extendedTextMessage.text);
  if (m.imageMessage?.caption) return String(m.imageMessage.caption);
  if (m.videoMessage?.caption) return String(m.videoMessage.caption);
  if (m.documentMessage?.caption) return String(m.documentMessage.caption);
  if (m.buttonsResponseMessage?.selectedDisplayText)
    return String(m.buttonsResponseMessage.selectedDisplayText);
  if (m.listResponseMessage?.title) return String(m.listResponseMessage.title);
  if (m.templateButtonReplyMessage?.selectedDisplayText)
    return String(m.templateButtonReplyMessage.selectedDisplayText);
  return '';
}

/**
 * Strict: only real booking Field:Value / confirmation paste → draft.
 * Keep in sync with src/lib/booking-message-detect.ts
 */
function looksLikeBookingRelatedWhatsApp(text) {
  const t = String(text || '').trim();
  if (t.length < 20) return false;
  const FIELD_LABEL =
    /^(product|customer|traveler|guest|property|airline|seller|pnr|confirmation(?:\s*(?:#|no\.?|number))?|record\s*locator|check[- ]?in|check[- ]?out|pickup|drop[- ]?off|route|sale|total(?:\s*cost)?|booked\s*through|purchased\s*from|departure|arrival|trip\s*id|hotel\s*confirmation)\s*:/gim;
  const fieldHits = [...t.matchAll(FIELD_LABEL)];
  const uniqueLabels = new Set(
    fieldHits.map((m) => String(m[1]).toLowerCase().replace(/\s+/g, ' ')),
  );
  if (uniqueLabels.size >= 2) return true;
  if (uniqueLabels.size === 1) {
    const label = [...uniqueLabels][0];
    const strong =
      /^(product|customer|traveler|property|pnr|confirmation|record locator|check-in|check in)$/i.test(
        label,
      );
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (
      strong &&
      lines.length >= 2 &&
      /\b(hotel|flight|car|pnr|check[- ]?in|check[- ]?out|confirmation|customer|traveler|property|airline|reservation)\b/i.test(
        t,
      )
    )
      return true;
  }
  const hasConfirm =
    /\b(confirmation|confirmed:\s*your\s+trip|reservation confirmed|booking confirmation|itinerary|e-?ticket|travel reservation|hotel confirmation|flight confirmation)\b/i.test(
      t,
    );
  const hasTravel =
    /\b(hotel|flight|airline|check[- ]?in|check[- ]?out|record locator|\bpnr\b|marriott|hilton|hyatt|st\.?\s*regis|united|delta|el al|amex travel|american express travel|expedia|taap|capital one travel|chase travel|travel reservation center|trip id|guest name|prepared for)\b/i.test(
      t,
    );
  if (hasConfirm && hasTravel && t.length >= 60) return true;
  return false;
}

function isPdfDocumentMessage(msg) {
  const doc = msg?.message?.documentMessage;
  if (!doc) return false;
  const mime = String(doc.mimetype || '').toLowerCase();
  const name = String(doc.fileName || doc.title || '');
  return mime.includes('pdf') || /\.pdf$/i.test(name);
}

/** Screenshot / photo reservation (Capital One, airline apps, etc.). */
function isImageMediaMessage(msg) {
  const m = msg?.message;
  if (!m) return false;
  if (m.imageMessage) return true;
  const doc = m.documentMessage;
  if (!doc) return false;
  const mime = String(doc.mimetype || '').toLowerCase();
  const name = String(doc.fileName || doc.title || '');
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function imageMeta(msg) {
  const img = msg?.message?.imageMessage;
  if (img) {
    const mime = String(img.mimetype || 'image/jpeg').toLowerCase();
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    return {
      mime_type: mime.startsWith('image/') ? mime : 'image/jpeg',
      filename: `whatsapp-${msg.key?.id || 'image'}.${ext}`,
    };
  }
  const doc = msg?.message?.documentMessage;
  if (doc) {
    return {
      mime_type: String(doc.mimetype || 'image/jpeg'),
      filename: doc.fileName || doc.title || `whatsapp-${msg.key?.id || 'image'}.jpg`,
    };
  }
  return { mime_type: 'image/jpeg', filename: 'whatsapp-image.jpg' };
}

/** Voice notes (PTT) + audio files. */
function isAudioMediaMessage(msg) {
  const m = msg?.message;
  if (!m) return false;
  if (m.audioMessage) return true;
  const doc = m.documentMessage;
  if (!doc) return false;
  const mime = String(doc.mimetype || '').toLowerCase();
  const name = String(doc.fileName || doc.title || '');
  return (
    mime.startsWith('audio/') ||
    mime === 'application/ogg' ||
    /\.(ogg|opus|mp3|m4a|wav|webm|aac|oga)$/i.test(name)
  );
}

function audioMeta(msg) {
  const audio = msg?.message?.audioMessage;
  if (audio) {
    const mime = String(audio.mimetype || 'audio/ogg; codecs=opus').toLowerCase();
    const ptt = Boolean(audio.ptt);
    const base = mime.split(';')[0].trim();
    const ext =
      base.includes('mpeg') || base.includes('mp3')
        ? 'mp3'
        : base.includes('mp4') || base.includes('m4a')
          ? 'm4a'
          : base.includes('wav')
            ? 'wav'
            : 'ogg';
    return {
      mime_type: base || 'audio/ogg',
      filename: `whatsapp-${ptt ? 'voice' : 'audio'}-${msg.key?.id || 'clip'}.${ext}`,
    };
  }
  const doc = msg?.message?.documentMessage;
  if (doc) {
    return {
      mime_type: String(doc.mimetype || 'audio/ogg'),
      filename: doc.fileName || doc.title || `whatsapp-audio-${msg.key?.id || 'clip'}.ogg`,
    };
  }
  return { mime_type: 'audio/ogg', filename: 'whatsapp-voice.ogg' };
}

function jidToNumber(jid) {
  if (!jid) return undefined;
  const user = String(jid).split('@')[0] || '';
  const base = user.split(':')[0];
  return base || undefined;
}

async function resolveChatName(sock, jid) {
  if (!jid) return 'unknown-chat';
  try {
    if (jid.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(jid);
      if (meta?.subject) return meta.subject;
    }
  } catch {
    /* ignore */
  }
  const num = jidToNumber(jid);
  return num ? `wa:${num}` : jid;
}

async function reactToMessage(sock, msg, emoji = '👀') {
  if (!sock || !msg?.key || msg.key.fromMe) return;
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key },
    });
  } catch (err) {
    console.warn(
      `[whatsapp-web-reader] react failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function sendIntakeStatusReply(sock, remoteJid, text, fromMe) {
  if (!replyIntakeStatus || !sock || !text || fromMe) return;
  try {
    await sock.sendMessage(remoteJid, { text: String(text).slice(0, 1200) });
  } catch (err) {
    console.warn(
      `[whatsapp-web-reader] status reply failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Immediate Owner-only alert from intake API (missing fields / draft-only / failure).
 * Never sends free-form chat — allowlisted owner_phones only.
 */
async function sendOwnerImmediateAlert(sock, text) {
  if (!allowOwnerAlerts || !sock || !text) return;
  if (!ownerPhones.length) {
    console.warn(
      '[whatsapp-web-reader] owner_alert_text present but owner_phones empty — skip',
    );
    return;
  }
  for (const phone of ownerPhones) {
    const jid = phoneToJid(phone);
    if (!jid) continue;
    await sock.sendMessage(jid, { text: String(text).slice(0, 3500) });
    console.log(`[owner-alert] immediate intake alert → ${phone}`);
  }
}

async function postDraft(payload) {
  const body = {
    session_label: sessionLabel,
    chat_name: payload.chat_name || undefined,
    from_number: payload.from_number || undefined,
    text: payload.text || '',
    received_at: payload.received_at || new Date().toISOString(),
    message_id: payload.message_id || undefined,
    actor_id: actorId,
    file_base64: payload.file_base64 || undefined,
    filename: payload.filename || undefined,
    mime_type: payload.mime_type || undefined,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-padova-wa-bridge': token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(
      `POST ${response.status}: ${typeof data === 'object' ? JSON.stringify(data) : text}`,
    );
    err.owner_alert_text = data?.owner_alert_text || null;
    err.skipped_chatter = Boolean(data?.skipped_chatter);
    err.customer_status_text = data?.customer_status_text || null;
    throw err;
  }
  return data;
}

async function logoutLocal() {
  await fs.rm(authDir, { recursive: true, force: true });
  console.log(`[logout] removed local session at ${authDir}`);
  console.log('[logout] also unlink this device in WhatsApp → Linked devices if it still shows.');
}

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Padova WhatsApp link</title>
  <style>
    :root { color-scheme: light; --ink:#1a2332; --muted:#5a6a7a; --ok:#1f6b3a; --wait:#8a5a00; --bg:#f3f6f9; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--ink);
      min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    main { width:min(420px,100%); text-align:center; }
    h1 { font-size:1.35rem; margin:0 0 8px; font-weight:650; }
    p { margin:0 0 12px; color:var(--muted); line-height:1.45; font-size:0.95rem; }
    #qrWrap { background:#fff; border-radius:12px; padding:20px; min-height:280px;
      display:flex; align-items:center; justify-content:center; box-shadow:0 1px 0 rgba(0,0,0,.04); }
    #qr { max-width:260px; width:100%; height:auto; image-rendering:pixelated; }
    #status { margin-top:16px; font-weight:600; font-size:1.05rem; }
    #status.waiting { color:var(--wait); }
    #status.linked { color:var(--ok); }
    #status.error { color:#9b1c1c; }
    #detail, #meta { color:var(--muted); font-size:0.88rem; margin-top:6px; }
    .note { margin-top:20px; font-size:0.8rem; color:var(--muted); text-align:left; line-height:1.4; }
  </style>
</head>
<body>
  <main>
    <h1>Padova WhatsApp link</h1>
    <p><strong>Step 1:</strong> Phone → WhatsApp → Linked devices → Link a device.<br/>
       <strong>Step 2:</strong> Scan the QR below.<br/>
       Read-only on this PC. Never sends messages.</p>
    <div id="qrWrap"><img id="qr" alt="WhatsApp QR" hidden /></div>
    <div id="status" class="waiting">Starting…</div>
    <div id="detail"></div>
    <div id="meta"></div>
    <p class="note">This page only works while the helper is running on this computer.
      It is not a public internet login. Leave the PC on after linking so new chats can become drafts.</p>
  </main>
  <script>
    const qr = document.getElementById('qr');
    const statusEl = document.getElementById('status');
    const detailEl = document.getElementById('detail');
    const metaEl = document.getElementById('meta');
    async function tick() {
      try {
        const res = await fetch('/status', { cache: 'no-store' });
        const data = await res.json();
        statusEl.textContent = data.label || data.status;
        statusEl.className = data.status || '';
        detailEl.textContent = data.detail || '';
        metaEl.textContent = data.meta || '';
        if (data.qrDataUrl) {
          qr.hidden = false;
          qr.src = data.qrDataUrl;
        } else {
          qr.hidden = true;
          qr.removeAttribute('src');
        }
      } catch (e) {
        statusEl.textContent = 'Helper offline';
        statusEl.className = 'error';
        detailEl.textContent = 'Start npm run intake:whatsapp-web on this PC, then refresh.';
      }
    }
    tick();
    setInterval(tick, 1500);
  </script>
</body>
</html>`;
}

function statusPayload() {
  const labels = {
    starting: 'Starting…',
    waiting: 'Scan this QR with your phone',
    linked: 'Linked — listening for messages',
    reconnecting: 'Reconnecting…',
    error: 'Error',
  };
  const metaParts = [];
  if (live.draftsPosted)
    metaParts.push(`${live.draftsPosted} draft(s) posted`);
  if (live.lastChat) metaParts.push(`last: ${live.lastChat}`);
  return {
    status: live.status,
    label: labels[live.status] || live.status,
    detail: live.detail,
    qrDataUrl: live.qrDataUrl,
    meta: metaParts.join(' · '),
    updatedAt: live.updatedAt,
    read_only: true,
    never_sends: true,
  };
}

async function openLocalBrowser(pageUrl) {
  if (!openBrowser) return;
  const { spawn } = await import('node:child_process');
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawn('open', [pageUrl], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', pageUrl], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else {
      spawn('xdg-open', [pageUrl], { stdio: 'ignore', detached: true }).unref();
    }
  } catch (err) {
    console.warn(
      `[whatsapp-web-reader] could not auto-open browser: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function startLocalUi() {
  const pageUrl = `http://${uiHost}:${uiPort}/`;
  const server = createServer((req, res) => {
    const pathName = (req.url || '/').split('?')[0];
    if (pathName === '/status') {
      const body = JSON.stringify(statusPayload());
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }
    if (pathName === '/' || pathName === '/index.html') {
      const body = pageHtml();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });
  server.listen(uiPort, uiHost, () => {
    console.log(`[whatsapp-web-reader] local page (this PC only): ${pageUrl}`);
    void openLocalBrowser(pageUrl);
  });
  server.on('error', (err) => {
    console.error(
      `[whatsapp-web-reader] local page failed (${uiHost}:${uiPort}): ${err.message}`,
    );
    console.error(
      '[whatsapp-web-reader] terminal QR still works; free the port or set PADOVA_WHATSAPP_UI_PORT',
    );
  });
  return server;
}

async function startReader() {
  requireConfig();
  await fs.mkdir(authDir, { recursive: true });

  console.log('[whatsapp-web-reader] inbound → drafts (never auto-reply to customers)');
  console.log(`[whatsapp-web-reader] padova api: ${url}`);
  console.log(`[whatsapp-web-reader] auth: ${authDir}`);
  console.log('[whatsapp-web-reader] phone: WhatsApp → Linked devices → Link a device');
  if (allowOwnerAlerts && ownerPhones.length) {
    console.log(
      `[whatsapp-web-reader] Owner alerts ON → ${ownerPhones.join(', ')} every ${alertIntervalMinutes}m`,
    );
    console.log(`[whatsapp-web-reader] reminders: ${remindersUrl || '(missing url)'}`);
  } else if (allowOwnerAlerts) {
    console.warn('[whatsapp-web-reader] Owner alerts flagged but owner_phones missing');
  } else {
    console.log('[whatsapp-web-reader] Owner alerts OFF (set allow_owner_alerts + owner_phones)');
  }

  const uiServer = startLocalUi();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  let sock;
  let stopping = false;
  let alertTimer = null;
  const processed = await loadState();

  const startOwnerAlertLoop = () => {
    if (!allowOwnerAlerts || !ownerPhones.length || alertTimer) return;
    const tick = async () => {
      try {
        await maybeSendOwnerAlerts(sock, processed);
      } catch (err) {
        console.error(
          `[whatsapp-web-reader] owner alert failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    };
    // First digest a minute after link (avoid race with reconnect).
    setTimeout(tick, 60_000);
    alertTimer = setInterval(tick, Math.min(alertIntervalMinutes, 60) * 60_000);
  };

  const connect = async () => {
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) =>
        !jid || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 1,
            width: 320,
            errorCorrectionLevel: 'M',
          });
          setLive({
            status: 'waiting',
            detail: 'Open WhatsApp → Linked devices → Link a device, then scan.',
            qrDataUrl,
          });
        } catch (err) {
          setLive({
            status: 'waiting',
            detail: 'QR ready in terminal (browser QR failed to render).',
            qrDataUrl: null,
          });
          console.warn(
            `[whatsapp-web-reader] browser QR encode failed: ${err instanceof Error ? err.message : err}`,
          );
        }
        console.log('\n—— Scan QR in browser page (or terminal below) ——\n');
        qrcodeTerminal.generate(qr, { small: true });
        console.log('\n—— waiting for scan ——\n');
      }
      if (connection === 'open') {
        setLive({
          status: 'linked',
          detail: allowOwnerAlerts
            ? 'Linked. Inbound → drafts. Owner alerts enabled (allowlist only).'
            : 'Leave this PC on. New inbound texts become drafts for staff approval.',
          qrDataUrl: null,
        });
        console.log('[whatsapp-web-reader] linked. Listening for inbound text…');
        console.log('[whatsapp-web-reader] Ctrl+C to stop. PC must stay online.');
        startOwnerAlertLoop();
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.warn(
          `[whatsapp-web-reader] connection closed (${statusCode ?? 'unknown'})${
            loggedOut ? ' — logged out' : ''
          }`,
        );
        if (stopping) return;
        if (loggedOut) {
          setLive({
            status: 'error',
            detail: 'Logged out. Run the helper again and scan a new QR.',
            qrDataUrl: null,
          });
          console.error(
            '[whatsapp-web-reader] session logged out. Run again and scan a new QR.',
          );
          process.exit(1);
        }
        setLive({
          status: 'reconnecting',
          detail: 'Connection dropped — reconnecting…',
          qrDataUrl: null,
        });
        await sleep(2500);
        try {
          await connect();
        } catch (err) {
          setLive({
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
            qrDataUrl: null,
          });
          console.error(
            `[whatsapp-web-reader] reconnect failed: ${err instanceof Error ? err.message : err}`,
          );
          process.exit(1);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // notify = live inbound only. Skip append/history sync so old chats
      // do not flood booking drafts on first link.
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          if (!msg?.message || msg.message.protocolMessage) continue;
          const remoteJid = msg.key?.remoteJid;
          if (
            !remoteJid ||
            isJidBroadcast(remoteJid) ||
            isJidStatusBroadcast(remoteJid) ||
            isJidNewsletter(remoteJid)
          )
            continue;

          let text = extractText(msg).trim();
          const pdfDoc = isPdfDocumentMessage(msg);
          const imageMedia = isImageMediaMessage(msg);
          const audioMedia = isAudioMediaMessage(msg);
          if (!text && !pdfDoc && !imageMedia && !audioMedia) continue;

          const id = messageKeyId(msg);
          if (processed.processed[id]) continue;

          // Text-only: skip chatter unless PDF/image/voice (server extract + re-checks).
          if (
            !pdfDoc &&
            !imageMedia &&
            !audioMedia &&
            !looksLikeBookingRelatedWhatsApp(text)
          ) {
            processed.processed[id] = new Date().toISOString();
            await saveState(processed);
            console.log(
              `[skip] not booking-related (${text.slice(0, 40).replace(/\s+/g, ' ')}…)`,
            );
            continue;
          }

          const chatName = await resolveChatName(sock, remoteJid);
          const fromNumber =
            jidToNumber(msg.key?.participant || remoteJid) || undefined;
          const receivedAt = msg.messageTimestamp
            ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
            : new Date().toISOString();

          let file_base64;
          let filename;
          let mime_type;
          if (pdfDoc || imageMedia || audioMedia) {
            const kind = pdfDoc ? 'PDF' : imageMedia ? 'image' : 'voice/audio';
            try {
              const buf = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                {
                  logger,
                  reuploadRequest: sock.updateMediaMessage,
                },
              );
              const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
              if (bytes.length > 10 * 1024 * 1024) {
                console.log(`[skip] ${kind} larger than 10 MB`);
                processed.processed[id] = new Date().toISOString();
                await saveState(processed);
                continue;
              }
              file_base64 = bytes.toString('base64');
              if (pdfDoc) {
                filename =
                  msg.message.documentMessage.fileName ||
                  msg.message.documentMessage.title ||
                  `whatsapp-${msg.key?.id || id}.pdf`;
                mime_type = msg.message.documentMessage.mimetype || 'application/pdf';
              } else if (imageMedia) {
                const meta = imageMeta(msg);
                filename = meta.filename;
                mime_type = meta.mime_type;
              } else {
                const meta = audioMeta(msg);
                filename = meta.filename;
                mime_type = meta.mime_type;
              }
            } catch (err) {
              console.error(
                `[whatsapp-web-reader] ${kind} download failed: ${err instanceof Error ? err.message : err}`,
              );
              // Never silent-drop reservation media — post note for staff.
              if (!text) {
                text = pdfDoc
                  ? `WhatsApp PDF could not be downloaded for extract. Filename: ${
                      msg.message.documentMessage.fileName ||
                      msg.message.documentMessage.title ||
                      'document.pdf'
                    }. Staff must open chat and re-send or paste.`
                  : imageMedia
                    ? `WhatsApp screenshot/image could not be downloaded for OCR. Staff must open chat and re-send, or paste confirmation text.`
                    : `WhatsApp voice note could not be downloaded for transcription. Staff must listen or ask the sender to paste text.`;
              }
            }
          }

          // Seen → react; after filing → short status reply (no invented money).
          if (reactOnSeen) await reactToMessage(sock, msg, '👀');

          let result;
          try {
            result = await postDraft({
              chat_name: chatName,
              from_number: fromNumber,
              text,
              received_at: receivedAt,
              message_id: msg.key?.id || id,
              file_base64,
              filename,
              mime_type,
            });
          } catch (postErr) {
            if (reactOnSeen) await reactToMessage(sock, msg, '⚠️');
            await sendIntakeStatusReply(
              sock,
              remoteJid,
              postErr?.customer_status_text ||
                'Padova received your message but could not file it automatically. Staff will review.',
              msg.key?.fromMe,
            );
            throw postErr;
          }

          processed.processed[id] = new Date().toISOString();
          await saveState(processed);

          if (reactOnSeen) {
            await reactToMessage(sock, msg, result?.live_booking ? '✅' : '📝');
          }
          await sendIntakeStatusReply(
            sock,
            remoteJid,
            result?.customer_status_text,
            msg.key?.fromMe,
          );

          if (result?.owner_alert_text) {
            try {
              await sendOwnerImmediateAlert(sock, result.owner_alert_text);
            } catch (alertErr) {
              console.error(
                `[whatsapp-web-reader] owner alert failed: ${
                  alertErr instanceof Error ? alertErr.message : alertErr
                }`,
              );
            }
          }

          const draftId = result?.draft?.id || result?.id || '?';
          const guest = result?.draft?.guest_name || result?.guest_name || '';
          const liveBit = result?.live_booking
            ? ` live=${result.booking_code || result.booking_id}`
            : '';
          const conf = result?.intake_confidence ? ` conf=${result.intake_confidence}` : '';
          const aiBit = result?.ai_created ? ' AI' : '';
          setLive({
            draftsPosted: live.draftsPosted + 1,
            lastDraftAt: new Date().toISOString(),
            lastChat: chatName,
            detail: `Listening. Last draft ${draftId}${guest ? ` (${guest})` : ''}${liveBit}${conf}${aiBit}.`,
          });
          console.log(
            `[draft] ${draftId}${guest ? ` (${guest})` : ''}${liveBit}${conf}${aiBit} ← ${chatName}${
              msg.key?.fromMe ? ' [from linked phone]' : ''
            }`,
          );
        } catch (err) {
          console.error(
            `[whatsapp-web-reader] message failed: ${err instanceof Error ? err.message : err}`,
          );
          if (err?.owner_alert_text && !err?.skipped_chatter) {
            try {
              await sendOwnerImmediateAlert(sock, err.owner_alert_text);
            } catch {
              /* ignore secondary */
            }
          }
        }
      }
    });
  };

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[whatsapp-web-reader] stopping…');
    if (alertTimer) {
      clearInterval(alertTimer);
      alertTimer = null;
    }
    try {
      uiServer.close();
    } catch {
      /* ignore */
    }
    try {
      sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await connect();
}

if (mode === 'logout') {
  await logoutLocal();
} else if (mode === 'check') {
  requireConfig();
  console.log('[check] WhatsApp Web QR reader');
  console.log(`[check] padova api: ${url}`);
  console.log(`[check] local page: http://${uiHost}:${uiPort}/`);
  console.log(`[check] auth: ${authDir}`);
  console.log(`[check] actor_id: ${actorId.slice(0, 8)}…`);
  console.log('[check] token: set');
  console.log('[check] OK — run: npm run intake:whatsapp-helper');
  console.log('[check] Owner: double-click scripts/whatsapp-pc-helper/Start-Padova-WhatsApp.command|.bat');
} else {
  await startReader();
}
