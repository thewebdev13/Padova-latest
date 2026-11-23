#!/usr/bin/env node
/**
 * Padova WhatsApp Web QR helper (Baileys — unofficial PC link).
 *
 * Links a multi-device WhatsApp session on this PC (scan QR like WhatsApp Web),
 * reads inbound reservation text → Padova booking_draft (Claude path on server).
 * Never auto-replies to customers.
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
import os from 'node:os';
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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Package root: folder with config.json (flat Windows zip) or repo layout (scripts/..). */
async function resolvePackageRoot() {
  const candidates = [
    scriptDir,
    path.resolve(scriptDir, '..'),
    path.resolve(scriptDir, '../..'),
  ];
  for (const dir of candidates) {
    if (await pathExists(path.join(dir, 'config.json'))) return dir;
    if (await pathExists(path.join(dir, 'scripts/whatsapp-pc-helper/config.json')))
      return dir;
  }
  return path.resolve(scriptDir, '..');
}

const root = await resolvePackageRoot();

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
    path.join(scriptDir, 'config.json'),
    path.join(root, 'config.json'),
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
        react_on_seen: 'PADOVA_WHATSAPP_REACT_ON_SEEN',
        assistant_enabled: 'PADOVA_WA_ASSISTANT_ENABLED',
      };
      // config.json wins over inherited shell/.env (Owner PC package must hit QA as written).
      for (const [from, envKey] of Object.entries(map)) {
        const value = data[from];
        if (value == null || value === '') continue;
        process.env[envKey] = String(value);
      }
      if (Array.isArray(data.owner_phones) && data.owner_phones.length) {
        process.env.PADOVA_WHATSAPP_OWNER_PHONES = data.owner_phones.map(String).join(',');
      }
      // Staff assistant allowlist (defaults to owner_phones when unset).
      if (Array.isArray(data.assistant_phones) && data.assistant_phones.length) {
        process.env.PADOVA_WA_ASSISTANT_PHONES = data.assistant_phones.map(String).join(',');
      } else if (Array.isArray(data.owner_phones) && data.owner_phones.length) {
        process.env.PADOVA_WA_ASSISTANT_PHONES = data.owner_phones.map(String).join(',');
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
const sessionLabel =
  process.env.PADOVA_WHATSAPP_SESSION_LABEL?.trim() || 'pc-web-reader';
/** Stable per-PC login folder (survives helper zip updates). QR only first time. */
function defaultPadovaHomeDir() {
  const slug = String(sessionLabel || 'pc')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'pc';
  return path.join(os.homedir(), '.padova', slug);
}
const padovaHome = defaultPadovaHomeDir();
const legacyAuthDir = path.resolve(root, '.data/whatsapp-web-auth');
const legacyStateFile = path.resolve(root, '.data/whatsapp-bridge-state.json');
const authDir =
  process.env.PADOVA_WHATSAPP_AUTH_DIR?.trim() ||
  path.join(padovaHome, 'whatsapp-web-auth');
const stateFile =
  process.env.PADOVA_WHATSAPP_STATE_FILE?.trim() ||
  path.join(padovaHome, 'whatsapp-bridge-state.json');
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
const ownerPhones = String(process.env.PADOVA_WHATSAPP_OWNER_PHONES || '')
  .split(/[,;\s]+/)
  .map((p) => p.replace(/\D/g, ''))
  .filter((p) => p.length >= 8 && p.length <= 15);
/** Staff assistant default ON — both Owner + Staff PCs use same flag. */
const assistantEnabled = !/^(0|false|no)$/i.test(
  String(process.env.PADOVA_WA_ASSISTANT_ENABLED || 'true').trim(),
);
/** Staff/Owner phones that may receive assistant Q&A (never customers). */
const assistantPhones = String(
  process.env.PADOVA_WA_ASSISTANT_PHONES || process.env.PADOVA_WHATSAPP_OWNER_PHONES || '',
)
  .split(/[,;\s]+/)
  .map((p) => p.replace(/\D/g, ''))
  .filter((p) => p.length >= 8 && p.length <= 15);
/** Mutable draft entry per staff chat — drafts table is immutable until SAVE promote. */
const assistantSessions = new Map();
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
  hasSavedSession: false,
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

function isAssistantPhone(fromNumber) {
  const n = String(fromNumber || '').replace(/\D/g, '');
  if (!n || !assistantPhones.length) return false;
  return assistantPhones.some((p) => n === p || n.endsWith(p) || p.endsWith(n));
}

const chatToneMemory = new Map(); // phone key → { helpCount, lastHelpAt }
const HELP_COOLDOWN_MS = 25 * 60 * 1000;
/** Instinct-style: screenshots arriving together → one booking draft. */
const MEDIA_BURST_MS = 10_000;
const mediaBursts = new Map(); // remoteJid → { items, timer, meta }

function toneKey(fromNumber) {
  return sessionKey(fromNumber) || 'unknown';
}

function getToneMemory(fromNumber) {
  const k = toneKey(fromNumber);
  return chatToneMemory.get(k) || { helpCount: 0, lastHelpAt: 0 };
}

function rememberToneHelp(fromNumber, showedMenu) {
  const k = toneKey(fromNumber);
  const prev = getToneMemory(fromNumber);
  chatToneMemory.set(k, {
    helpCount: showedMenu ? (prev.helpCount || 0) + 1 : prev.helpCount || 0,
    lastHelpAt: showedMenu ? Date.now() : prev.lastHelpAt || 0,
  });
}

function isStaffSmalltalkText(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, '');
  if (!t || t.length > 60) return false;
  return /^(how are you|how('?s| is) it going|how('?s| are) things|what'?s up|whats up|you good|you okay|you ok|how's your day|how is your day)\b/.test(
    t,
  );
}

function isAssistantGreetingText(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, '');
  if (!t || t.length > 48) return false;
  if (isStaffSmalltalkText(t)) return true;
  return /^(hi|hello|hey|yo|hola|help|menu|options|start|hiya|sup|good\s*(morning|afternoon|evening)|what can you do|how (can|may) i help)\b/.test(
    t,
  );
}

function isAssistantOpsQuestion(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, '');
  if (!t || t.length > 160) return false;
  if (isAssistantGreetingText(t)) return false;
  return (
    /\b(pending|missing|unpaid|overdue|reminder|reminders|status|overview|desk|pulse|backlog|attention|needs?\s*review|open\s*drafts?|how\s*many|anything\s*(open|left|missing|pending)|what('?s|\s+is)\s*(open|pending|missing|left)|catch\s*me\s*up|quick\s*(update|check)|platform|bookings?\s*(waiting|open|pending))\b/i.test(
      t,
    ) || /^(status|update|pending|missing|reminders?|desk)$/i.test(t)
  );
}

function formatStaffChoiceMenu() {
  return [
    '1) File a reservation (PDF, screenshot, or paste)',
    '2) Check pending / missing work',
    '3) Find a screen in Padova',
    '4) Something else, just ask',
  ].join('\n');
}

function formatAssistantOpeningReply(text, memory) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, '');
  const mem = memory || { helpCount: 0, lastHelpAt: 0 };
  const recentHelp =
    mem.helpCount > 0 && Date.now() - (mem.lastHelpAt || 0) < HELP_COOLDOWN_MS;
  const wantMenu = /^(help|menu|options|start)$/.test(t);
  const smalltalk = isStaffSmalltalkText(t);

  if (smalltalk) {
    if (!recentHelp && !mem.helpCount) {
      return {
        text: [
          "I'm good, thanks. How can I help you today?",
          '',
          formatStaffChoiceMenu(),
        ].join('\n'),
        showedMenu: true,
      };
    }
    return {
      text: "I'm good, thanks. What do you need?",
      showedMenu: false,
    };
  }

  if (wantMenu) {
    return {
      text: ['Sure. Pick one:', '', formatStaffChoiceMenu()].join('\n'),
      showedMenu: true,
    };
  }

  if (recentHelp) {
    const short = [
      'Hey again. What do you need?',
      'Hi. Still here, just tell me what you need.',
      'Hey. Go ahead.',
    ];
    return {
      text: short[mem.helpCount % short.length],
      showedMenu: false,
    };
  }

  const hellos = [
    'Hey, how can I help you today?',
    'Hi. What can I help with?',
    'Hey. What do you need?',
  ];
  return {
    text: [hellos[mem.helpCount % hellos.length], '', formatStaffChoiceMenu()].join('\n'),
    showedMenu: true,
  };
}

function formatAssistantHelpMenu(memory) {
  return formatAssistantOpeningReply('hi', memory).text;
}

function isAssistantGuideQuestion(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase();
  if (!t || t.length > 200) return false;
  if (isAssistantGreetingText(t) || isAssistantOpsQuestion(t)) return false;
  return (
    /\b(where|how (do|can|to)|find|open|path|url|link|navigate|go to|screen|page|menu|setup|set\s*up)\b/.test(
      t,
    ) &&
    /\b(drafts?|booking|attention|payment|accounting|partnership|commission|follow|people|supplier|settings|whatsapp|helper|padova)\b/.test(
      t,
    )
  );
}

function isAssistantFreeChat(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 2 || t.length > 280) return false;
  if (isAssistantGreetingText(t)) return false;
  if (isAssistantOpsQuestion(t)) return false;
  if (isAssistantGuideQuestion(t)) return false;
  if (/^(save|yes|confirm|cancel|stop|no)\b/i.test(t)) return false;
  if (
    /^(customer|traveler|product|travel\s*start|travel\s*end|sale|price|booked\s*through|where\s*booked|cost\s*notes?|route|location)\s*[:\-]?\s+/im.test(
      t,
    )
  )
    return false;
  // Questions / short asks only — not long reservation dumps.
  const words = t.split(/\s+/).length;
  if (/[?]/.test(t)) return true;
  if (
    /^(can you|could you|please|what|where|how|why|when|who|show|tell|help|explain|find|open|list|give|make|create|need)\b/i.test(
      t,
    )
  )
    return true;
  return words <= 12;
}

function sessionKey(fromNumber) {
  const n = String(fromNumber || '').replace(/\D/g, '');
  return n ? n.slice(-12) : '';
}

/**
 * Never send assistant text into a customer chat.
 * - If sender is staff phone → reply in that chat.
 * - Else (customer reservation) → fan-out only to assistant/owner phones.
 */
async function sendAssistantReply(sock, remoteJid, fromNumber, text) {
  if (!sock || !text) return;
  const targets = [];
  if (isAssistantPhone(fromNumber) && remoteJid) {
    targets.push({ jid: remoteJid, label: fromNumber });
  } else {
    const phones = assistantPhones.length ? assistantPhones : ownerPhones;
    for (const phone of phones) {
      const jid = phoneToJid(phone);
      if (jid) targets.push({ jid, label: phone });
    }
  }
  if (!targets.length) {
    console.warn(
      '[assistant] no staff phones to notify — set owner_phones / assistant_phones in config.json',
    );
    return;
  }
  const body = String(text).slice(0, 3500);
  for (const t of targets) {
    await sock.sendMessage(t.jid, { text: body });
    console.log(`[assistant] reply → ${t.label}`);
  }
}

function rememberAssistantSession(draftId, entry, title) {
  if (!draftId || !entry) return;
  const payload = { draft_id: String(draftId), entry, title: title || '' };
  const phones = assistantPhones.length ? assistantPhones : ownerPhones;
  for (const phone of phones) {
    const sk = sessionKey(phone);
    if (sk) assistantSessions.set(sk, payload);
  }
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

/**
 * Immediate Owner-only alert from intake API (missing fields / draft-only / failure).
 * Never sends free-form chat — allowlisted owner_phones only.
 */
async function sendOwnerImmediateAlert(sock, text) {
  // Auto spam off: technical intake alerts / digests only when allow_owner_alerts is true.
  // Staff assistant Q&A answers questions on demand; do not push junk alerts.
  if (!allowOwnerAlerts || !sock || !text) return;
  if (/intake alert|confidence:|extract:ai|Tags:/i.test(String(text))) {
    console.log('[owner-alert] skipped technical intake alert (ask for a report instead)');
    return;
  }
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
    files: Array.isArray(payload.files) ? payload.files : undefined,
    draft_id: payload.draft_id || undefined,
    entry: payload.entry || undefined,
    // Default ON — same for Owner PC + Staff PC; server trusts bridge token.
    assistant: assistantEnabled,
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

async function credsFileExists(dir) {
  try {
    await fs.access(path.join(dir, 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

/** One-time: keep old project .data session so client is not forced to re-scan. */
async function migrateLegacySessionIfNeeded() {
  if (process.env.PADOVA_WHATSAPP_AUTH_DIR?.trim()) return;
  if (await credsFileExists(authDir)) return;
  if (!(await credsFileExists(legacyAuthDir))) return;
  await fs.mkdir(path.dirname(authDir), { recursive: true });
  await fs.cp(legacyAuthDir, authDir, { recursive: true });
  console.log(`[whatsapp-web-reader] migrated saved login → ${authDir}`);
  try {
    await fs.access(legacyStateFile);
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.copyFile(legacyStateFile, stateFile);
  } catch {
    /* optional */
  }
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
  <title>Padova WhatsApp</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@450;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,650&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #10231f;
      --muted: #5c6f6a;
      --line: rgba(16, 35, 31, 0.1);
      --ok: #0f7a52;
      --ok-soft: #e6f6ee;
      --wait: #9a6b12;
      --wait-soft: #fff6e5;
      --err: #a11f2c;
      --err-soft: #fdecee;
      --panel: rgba(255, 252, 248, 0.88);
      --accent: #1b6b5a;
      --glow: rgba(27, 107, 90, 0.22);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: "Instrument Sans", system-ui, sans-serif;
      background:
        radial-gradient(900px 520px at 12% -10%, rgba(47, 140, 118, 0.28), transparent 55%),
        radial-gradient(700px 480px at 100% 0%, rgba(214, 176, 110, 0.22), transparent 50%),
        linear-gradient(165deg, #eef5f2 0%, #f7f3ea 48%, #e8eef2 100%);
      display: grid;
      place-items: center;
      padding: 28px 18px 36px;
    }
    main {
      width: min(440px, 100%);
      animation: rise 0.55s ease-out both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 var(--glow); }
      50% { box-shadow: 0 0 0 10px transparent; }
    }
    @keyframes shimmer {
      0% { background-position: 0% 50%; }
      100% { background-position: 100% 50%; }
    }
    .brand {
      text-align: center;
      margin-bottom: 18px;
    }
    .brand-mark {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .brand-dot {
      width: 11px; height: 11px; border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(27, 107, 90, 0.15);
    }
    .brand h1 {
      margin: 0;
      font-family: Newsreader, Georgia, serif;
      font-weight: 650;
      font-size: clamp(1.7rem, 4vw, 2.05rem);
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .brand p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .shell {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 22px 20px 18px;
      backdrop-filter: blur(10px);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.7) inset,
        0 18px 40px rgba(16, 35, 31, 0.08);
    }
    .steps {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
      text-align: left;
      color: var(--muted);
      font-size: 0.86rem;
      line-height: 1.4;
    }
    .steps li {
      display: grid;
      grid-template-columns: 22px 1fr;
      gap: 8px;
      align-items: start;
    }
    .steps b {
      width: 22px; height: 22px; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 0.72rem;
      color: #fff;
      background: var(--accent);
    }
    #stage {
      min-height: 260px;
      border-radius: 16px;
      border: 1px dashed rgba(16, 35, 31, 0.14);
      background:
        linear-gradient(120deg, rgba(255,255,255,0.55), rgba(238,245,242,0.9), rgba(255,255,255,0.55));
      background-size: 200% 200%;
      animation: shimmer 7s ease infinite;
      display: grid;
      place-items: center;
      padding: 18px;
      position: relative;
      overflow: hidden;
    }
    body[data-state="linked"] #stage {
      border-style: solid;
      border-color: rgba(15, 122, 82, 0.28);
      background: linear-gradient(160deg, #f3fbf7 0%, #eaf6f1 100%);
      animation: none;
    }
    body[data-state="error"] #stage {
      border-color: rgba(161, 31, 44, 0.25);
      background: var(--err-soft);
      animation: none;
    }
    #qr { max-width: 240px; width: 100%; height: auto; image-rendering: pixelated; border-radius: 8px; }
    #linkedPanel, #errorPanel { display: none; width: 100%; text-align: center; padding: 8px 6px; }
    body[data-state="linked"] #linkedPanel { display: block; }
    body[data-state="error"] #errorPanel { display: block; }
    body[data-state="linked"] #qr,
    body[data-state="error"] #qr,
    body[data-state="linked"] .steps,
    body[data-state="error"] .steps { display: none !important; }
    .live-orb {
      width: 64px; height: 64px; margin: 0 auto 14px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #7ddec0, #0f7a52 70%);
      animation: pulse 2.4s ease-in-out infinite;
    }
    .live-title {
      font-family: Newsreader, Georgia, serif;
      font-size: 1.35rem;
      font-weight: 650;
      margin: 0 0 6px;
      color: var(--ok);
    }
    .live-sub {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .stats {
      display: none;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 16px;
    }
    body[data-state="linked"] .stats { display: grid; }
    .stat {
      text-align: left;
      padding: 12px 12px 10px;
      border-radius: 14px;
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--line);
    }
    .stat span {
      display: block;
      font-size: 0.72rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .stat strong {
      font-size: 1.02rem;
      font-weight: 650;
      word-break: break-word;
    }
    #status {
      margin-top: 14px;
      font-weight: 650;
      font-size: 0.98rem;
      text-align: center;
    }
    #status.waiting, #status.starting, #status.reconnecting { color: var(--wait); }
    #status.linked { color: var(--ok); }
    #status.error { color: var(--err); }
    #detail, #meta {
      color: var(--muted);
      font-size: 0.84rem;
      line-height: 1.45;
      text-align: center;
      margin-top: 6px;
      min-height: 1.2em;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 14px;
    }
    .pill {
      font-size: 0.72rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.65);
      color: var(--muted);
    }
    .pill.on {
      color: var(--ok);
      border-color: rgba(15, 122, 82, 0.28);
      background: var(--ok-soft);
    }
    .note {
      margin: 16px 2px 0;
      font-size: 0.78rem;
      color: var(--muted);
      line-height: 1.45;
      text-align: center;
    }
  </style>
</head>
<body data-state="starting">
  <main>
    <header class="brand">
      <div class="brand-mark"><span class="brand-dot" aria-hidden="true"></span></div>
      <h1>Padova WhatsApp</h1>
      <p>Local bridge for this PC — drafts &amp; staff assistant.<br/>
         <strong>QR once</strong> — next launches reuse the saved login.</p>
    </header>
    <section class="shell">
      <ol class="steps" id="steps">
        <li><b>1</b><span>First time only: Phone → WhatsApp → <strong>Linked devices</strong> → Link a device</span></li>
        <li><b>2</b><span>Scan the QR below. Later days: just start the helper — no new QR.</span></li>
      </ol>
      <div id="stage">
        <img id="qr" alt="WhatsApp QR" hidden />
        <div id="linkedPanel">
          <div class="live-orb" aria-hidden="true"></div>
          <p class="live-title">Connected</p>
          <p class="live-sub">Listening. Ask naturally: pending work, reports, where a screen is, or send a reservation.</p>
        </div>
        <div id="errorPanel">
          <p class="live-title" style="color:var(--err)">Connection issue</p>
          <p class="live-sub">Restart the helper on this PC, then refresh.</p>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span>Drafts</span><strong id="statDrafts">0</strong></div>
        <div class="stat"><span>Last chat</span><strong id="statChat">—</strong></div>
      </div>
      <div id="status" class="waiting">Starting…</div>
      <div id="detail"></div>
      <div id="meta"></div>
      <div class="pill-row">
        <span class="pill on" id="pillAssist">Assistant on</span>
        <span class="pill" id="pillAlert">Owner alerts</span>
        <span class="pill">This PC only</span>
      </div>
      <p class="note">Keep the helper running and the PC awake. Staff replies (help menu / SAVE) stay on allowlisted phones — customers are not auto-chatted.</p>
    </section>
  </main>
  <script>
    const qr = document.getElementById('qr');
    const statusEl = document.getElementById('status');
    const detailEl = document.getElementById('detail');
    const metaEl = document.getElementById('meta');
    const statDrafts = document.getElementById('statDrafts');
    const statChat = document.getElementById('statChat');
    const pillAlert = document.getElementById('pillAlert');
    const pillAssist = document.getElementById('pillAssist');
    async function tick() {
      try {
        const res = await fetch('/status', { cache: 'no-store' });
        const data = await res.json();
        const state = data.status || 'starting';
        document.body.dataset.state = state;
        statusEl.textContent = data.label || state;
        statusEl.className = state;
        detailEl.textContent = data.detail || '';
        metaEl.textContent = data.meta || '';
        statDrafts.textContent = String(data.draftsPosted ?? 0);
        statChat.textContent = data.lastChat || '—';
        if (data.assistantEnabled) {
          pillAssist.classList.add('on');
          pillAssist.textContent = 'Assistant on';
        } else {
          pillAssist.classList.remove('on');
          pillAssist.textContent = 'Assistant off';
        }
        if (data.ownerAlerts) {
          pillAlert.classList.add('on');
          pillAlert.textContent = 'Owner alerts on';
        } else {
          pillAlert.classList.remove('on');
          pillAlert.textContent = 'Owner alerts';
        }
        const steps = document.getElementById('steps');
        if (steps) {
          steps.style.display =
            state === 'waiting' || (!data.hasSavedSession && state !== 'linked' && state !== 'error')
              ? ''
              : 'none';
        }
        if (data.qrDataUrl && state !== 'linked') {
          qr.hidden = false;
          qr.src = data.qrDataUrl;
        } else {
          qr.hidden = true;
          qr.removeAttribute('src');
        }
      } catch (e) {
        document.body.dataset.state = 'error';
        statusEl.textContent = 'Helper offline';
        statusEl.className = 'error';
        detailEl.textContent =
          'Helper is not running. On Windows: double-click START.bat once, keep the black window open, then refresh this page.';
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
    starting: live.hasSavedSession
      ? 'Opening saved WhatsApp login…'
      : 'Starting…',
    waiting: 'Scan this QR with your phone (first time only)',
    linked: 'Linked — listening for messages',
    reconnecting: 'Reconnecting saved login…',
    error: 'Error',
  };
  const metaParts = [];
  if (live.draftsPosted)
    metaParts.push(`${live.draftsPosted} draft(s) posted`);
  if (live.lastChat) metaParts.push(`last: ${live.lastChat}`);
  if (live.hasSavedSession && live.status !== 'waiting')
    metaParts.push('saved login');
  return {
    status: live.status,
    label: labels[live.status] || live.status,
    detail: live.detail,
    qrDataUrl: live.qrDataUrl,
    meta: metaParts.join(' · '),
    updatedAt: live.updatedAt,
    draftsPosted: live.draftsPosted || 0,
    lastChat: live.lastChat || null,
    hasSavedSession: Boolean(live.hasSavedSession),
    assistantEnabled,
    ownerAlerts: allowOwnerAlerts && ownerPhones.length > 0,
    local_only: true,
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
  return new Promise((resolve, reject) => {
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
    server.once('error', async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.log(
          `[whatsapp-web-reader] already running on ${pageUrl} — opening browser only (no second helper).`,
        );
        await openLocalBrowser(pageUrl);
        process.exit(0);
        return;
      }
      console.error(
        `[whatsapp-web-reader] local page failed (${uiHost}:${uiPort}): ${err.message}`,
      );
      reject(err);
    });
    server.listen(uiPort, uiHost, () => {
      console.log(`[whatsapp-web-reader] local page (this PC only): ${pageUrl}`);
      void openLocalBrowser(pageUrl);
      resolve(server);
    });
  });
}

async function startReader() {
  requireConfig();
  await migrateLegacySessionIfNeeded();
  await fs.mkdir(authDir, { recursive: true });
  const hasSavedSession = await credsFileExists(authDir);
  live.hasSavedSession = hasSavedSession;
  if (hasSavedSession) {
    setLive({
      status: 'starting',
      detail: 'Saved WhatsApp login found — reconnecting (no QR unless WhatsApp asks again).',
      qrDataUrl: null,
    });
  }

  console.log('[whatsapp-web-reader] inbound → drafts (never auto-reply to customers)');
  console.log(`[whatsapp-web-reader] padova api: ${url}`);
  console.log(`[whatsapp-web-reader] auth: ${authDir}`);
  if (hasSavedSession) {
    console.log('[whatsapp-web-reader] saved login found — QR only if WhatsApp requires re-link');
  } else {
    console.log('[whatsapp-web-reader] first link: Phone → WhatsApp → Linked devices → scan QR');
  }
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

  // UI first — page stays up even if WhatsApp session needs a moment / reconnect.
  const uiServer = await startLocalUi();

  process.on('uncaughtException', (err) => {
    console.error('[whatsapp-web-reader] uncaughtException:', err);
    setLive({
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    });
  });
  process.on('unhandledRejection', (err) => {
    console.error('[whatsapp-web-reader] unhandledRejection:', err);
    setLive({
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    });
  });

  let authState = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  let sock;
  let stopping = false;
  let alertTimer = null;
  let clearingSession = false;
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

  /** Dead/expired WhatsApp login (401) → wipe local auth and show a fresh QR. */
  async function resetSessionAndRelink(reason) {
    if (clearingSession || stopping) return;
    clearingSession = true;
    console.warn(`[whatsapp-web-reader] clearing dead session (${reason}) → new QR`);
    setLive({
      status: 'waiting',
      detail: 'Previous WhatsApp login expired. Scan the new QR on this page.',
      qrDataUrl: null,
      hasSavedSession: false,
    });
    try {
      sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
    try {
      await fs.rm(authDir, { recursive: true, force: true });
      await fs.mkdir(authDir, { recursive: true });
      authState = await useMultiFileAuthState(authDir);
      live.hasSavedSession = false;
    } catch (err) {
      console.error(
        `[whatsapp-web-reader] could not clear session: ${err instanceof Error ? err.message : err}`,
      );
    }
    clearingSession = false;
    await sleep(800);
    try {
      await connect();
    } catch (err) {
      setLive({
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const connect = async () => {
    sock = makeWASocket({
      version,
      auth: {
        creds: authState.state.creds,
        keys: makeCacheableSignalKeyStore(authState.state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) =>
        !jid || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
    });

    sock.ev.on('creds.update', authState.saveCreds);

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
        // 401 / loggedOut = dead saved login — clear and show QR (do not leave user stuck).
        if (loggedOut || statusCode === 401) {
          await resetSessionAndRelink(statusCode ?? 'logged-out');
          return;
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
          // Keep UI up; user can restart START.bat once.
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

          const chatName = await resolveChatName(sock, remoteJid);
          const fromNumber =
            jidToNumber(msg.key?.participant || remoteJid) || undefined;

          // Numbered menu picks (1–4) after opener.
          if (
            assistantEnabled &&
            !pdfDoc &&
            !imageMedia &&
            !audioMedia &&
            /^[1-4]$/.test(String(text || '').trim())
          ) {
            const pick = String(text).trim();
            processed.processed[id] = new Date().toISOString();
            await saveState(processed);
            let reply =
              'Got it. Tell me what you need in your own words.';
            if (pick === '1') {
              reply =
                'Send the reservation as a PDF, screenshot, or paste. I will draft it and ask only what is still blank.';
            } else if (pick === '2') {
              // Fall through to server desk check
              text = 'anything pending?';
            } else if (pick === '3') {
              text = 'where are drafts?';
            } else if (pick === '4') {
              reply = 'Sure. What do you need?';
            }
            if (pick === '1' || pick === '4') {
              try {
                await sock.sendMessage(remoteJid, { text: reply });
              } catch (err) {
                console.warn(
                  `[assistant] menu pick failed: ${err instanceof Error ? err.message : err}`,
                );
              }
              continue;
            }
            // pick 2/3 continue into postDraft path below with rewritten text
          }

          // Staff opener (hi / how are you / help) → short human reply. No reaction spam.
          if (
            assistantEnabled &&
            !pdfDoc &&
            !imageMedia &&
            !audioMedia &&
            isAssistantGreetingText(text)
          ) {
            const inbound = !msg.key?.fromMe;
            const remoteDigits = jidToNumber(remoteJid);
            const staffChat =
              isAssistantPhone(fromNumber) ||
              isAssistantPhone(remoteDigits) ||
              !assistantPhones.length;
            if (inbound || staffChat) {
              processed.processed[id] = new Date().toISOString();
              await saveState(processed);
              const mem = getToneMemory(fromNumber);
              const opening = formatAssistantOpeningReply(text, mem);
              rememberToneHelp(fromNumber, opening.showedMenu);
              try {
                await sock.sendMessage(remoteJid, { text: opening.text });
                console.log(`[assistant] opener → ${chatName}`);
              } catch (err) {
                console.warn(
                  `[assistant] opener failed: ${err instanceof Error ? err.message : err}`,
                );
              }
              setLive({
                detail: `Listening. Replied in ${chatName}.`,
              });
              continue;
            }
          }

          const skEarly = sessionKey(fromNumber);
          const staffSide =
            isAssistantPhone(fromNumber) || !assistantPhones.length;
          const assistantOps = assistantEnabled && isAssistantOpsQuestion(text);
          const assistantGuide =
            assistantEnabled && staffSide && isAssistantGuideQuestion(text);
          const assistantFree =
            assistantEnabled && staffSide && isAssistantFreeChat(text);
          const assistantFollowUp =
            (isAssistantPhone(fromNumber) &&
              Boolean(skEarly && assistantSessions.get(skEarly)) &&
              /^(save|yes|confirm|cancel|stop|no)\b/i.test(text.trim())) ||
            (isAssistantPhone(fromNumber) &&
              /^(customer|traveler|product|travel\s*start|travel\s*end|sale|price|booked\s*through|where\s*booked|cost\s*notes?|route|location)\s*[:\-]?\s+/im.test(
                text,
              )) ||
            (assistantEnabled &&
              Boolean(skEarly && assistantSessions.get(skEarly)) &&
              /^(save|yes|confirm|cancel|stop|no)\b/i.test(text.trim())) ||
            (assistantEnabled &&
              /^(customer|traveler|product|travel\s*start|travel\s*end|sale|price|booked\s*through|where\s*booked|cost\s*notes?|route|location)\s*[:\-]?\s+/im.test(
                text,
              ));

          // Text-only: skip chatter unless media, staff follow-up, desk Q&A, guide, or free chat.
          if (
            !pdfDoc &&
            !imageMedia &&
            !audioMedia &&
            !assistantFollowUp &&
            !assistantOps &&
            !assistantGuide &&
            !assistantFree &&
            !looksLikeBookingRelatedWhatsApp(text)
          ) {
            processed.processed[id] = new Date().toISOString();
            await saveState(processed);
            console.log(
              `[skip] not booking-related (${text.slice(0, 40).replace(/\s+/g, ' ')}…)`,
            );
            continue;
          }
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

          // Burst buffer: multiple screenshots/PDFs in ~10s from same chat → one draft.
          if (file_base64 && (imageMedia || pdfDoc)) {
            processed.processed[id] = new Date().toISOString();
            await saveState(processed);
            if (reactOnSeen) await reactToMessage(sock, msg, '👀');
            let burst = mediaBursts.get(remoteJid);
            if (!burst) {
              burst = {
                items: [],
                timer: null,
                chatName,
                fromNumber,
                captions: [],
              };
              mediaBursts.set(remoteJid, burst);
            }
            burst.items.push({
              file_base64,
              filename,
              mime_type,
              message_id: msg.key?.id || id,
            });
            if (text) burst.captions.push(text);
            burst.chatName = chatName;
            burst.fromNumber = fromNumber;
            if (burst.timer) clearTimeout(burst.timer);
            burst.timer = setTimeout(() => {
              void (async () => {
                const batch = mediaBursts.get(remoteJid);
                mediaBursts.delete(remoteJid);
                if (!batch?.items?.length) return;
                try {
                  const result = await postDraft({
                    chat_name: batch.chatName,
                    from_number: batch.fromNumber,
                    text: batch.captions.join('\n'),
                    received_at: new Date().toISOString(),
                    message_id: batch.items.map((i) => i.message_id).join('+'),
                    file_base64: batch.items[0].file_base64,
                    filename: batch.items[0].filename,
                    mime_type: batch.items[0].mime_type,
                    files: batch.items.map((i) => ({
                      file_base64: i.file_base64,
                      filename: i.filename,
                      mime_type: i.mime_type,
                    })),
                  });
                  if (reactOnSeen) {
                    await reactToMessage(
                      sock,
                      msg,
                      result?.live_booking ? '✅' : '📝',
                    );
                  }
                  if (result?.assistant_reply_text) {
                    await sendAssistantReply(
                      sock,
                      remoteJid,
                      batch.fromNumber,
                      result.assistant_reply_text,
                    );
                  }
                  setLive({
                    draftsPosted: live.draftsPosted + 1,
                    lastDraftAt: new Date().toISOString(),
                    lastChat: batch.chatName,
                    detail: `Listening. Merged ${batch.items.length} media → one draft.`,
                  });
                  console.log(
                    `[draft] merged ${batch.items.length} media ← ${batch.chatName}`,
                  );
                } catch (err) {
                  console.error(
                    `[whatsapp-web-reader] media burst failed: ${
                      err instanceof Error ? err.message : err
                    }`,
                  );
                }
              })();
            }, MEDIA_BURST_MS);
            setLive({
              detail: `Listening. Holding ${burst.items.length} screenshot(s) to merge…`,
            });
            continue;
          }

          // React only on real reservation intake (media / booking paste), not every chat line.
          const intakeReact =
            reactOnSeen &&
            (Boolean(audioMedia) || looksLikeBookingRelatedWhatsApp(text));
          if (intakeReact) await reactToMessage(sock, msg, '👀');

          const sk = sessionKey(fromNumber);
          const openSession =
            isAssistantPhone(fromNumber) && sk && assistantSessions.get(sk)
              ? assistantSessions.get(sk)
              : null;
          // Follow-up answers (SAVE / Customer: …) reuse session entry; new media starts fresh.
          const reuseSession = Boolean(openSession && !file_base64);

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
              draft_id: reuseSession ? openSession.draft_id : undefined,
              entry: reuseSession ? openSession.entry : undefined,
            });
          } catch (postErr) {
            if (intakeReact) await reactToMessage(sock, msg, '⚠️');
            throw postErr;
          }

          processed.processed[id] = new Date().toISOString();
          await saveState(processed);

          if (intakeReact) {
            await reactToMessage(sock, msg, result?.live_booking ? '✅' : '📝');
          }

          if (result?.assistant) {
            if (result.live_booking) {
              if (sk) assistantSessions.delete(sk);
              for (const phone of assistantPhones.length ? assistantPhones : ownerPhones) {
                const psk = sessionKey(phone);
                if (psk) assistantSessions.delete(psk);
              }
            } else if (result.id && result.entry) {
              rememberAssistantSession(
                result.id,
                result.entry,
                result.title || openSession?.title || '',
              );
              if (sk && isAssistantPhone(fromNumber)) {
                assistantSessions.set(sk, {
                  draft_id: String(result.id),
                  entry: result.entry,
                  title: result.title || openSession?.title || '',
                });
              }
            }
          }

          if (result?.assistant_reply_text) {
            try {
              await sendAssistantReply(
                sock,
                msg.key.remoteJid,
                fromNumber,
                result.assistant_reply_text,
              );
            } catch (assistErr) {
              console.error(
                `[assistant] reply failed: ${
                  assistErr instanceof Error ? assistErr.message : assistErr
                }`,
              );
            }
          }

          if (result?.owner_alert_text && !result?.assistant) {
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
          const asstBit = result?.assistant ? ' assistant' : '';
          setLive({
            draftsPosted: live.draftsPosted + 1,
            lastDraftAt: new Date().toISOString(),
            lastChat: chatName,
            detail: `Listening. Last draft ${draftId}${guest ? ` (${guest})` : ''}${liveBit}${conf}${aiBit}${asstBit}.`,
          });
          console.log(
            `[draft] ${draftId}${guest ? ` (${guest})` : ''}${liveBit}${conf}${aiBit}${asstBit} ← ${chatName}${
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
  console.log('[check] OK — run START.bat on Windows (keep the window open)');
} else {
  try {
    await startReader();
  } catch (err) {
    console.error(
      `[whatsapp-web-reader] failed to start: ${err instanceof Error ? err.message : err}`,
    );
    setLive({
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    });
    // Keep process alive briefly so user can read the console.
    await sleep(60_000);
    process.exit(1);
  }
}
