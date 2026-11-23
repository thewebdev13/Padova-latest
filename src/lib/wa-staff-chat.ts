/**
 * Advanced WhatsApp staff chat: human tone, desk reports, app navigation,
 * optional LLM phrasing. Never invents money. Staff only.
 */

import {
  aiIntakeEnabled,
  aiModel,
  resolveAiApiKey,
  stripClaudeMarkdownFence,
  type AiProvider,
} from './claude-intake';
import { redactOperationalText } from './operational-redaction';
import { workspacePath } from './workspace-routes';

export type StaffChatIntent =
  | 'greeting'
  | 'smalltalk'
  | 'menu'
  | 'ops'
  | 'report'
  | 'guide'
  | 'chat';

export type StaffChatMemory = {
  helpCount?: number;
  lastHelpAt?: number;
  lastKinds?: string[];
};

const AI_CHAT_TIMEOUT_MS = 18_000;
const HELP_COOLDOWN_MS = 25 * 60 * 1000;

export function padovaAppBaseUrl(): string {
  const raw =
    process.env.PADOVA_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PADOVA_QA_URL ||
    'https://qa.padovatravel.com';
  return String(raw).trim().replace(/\/+$/, '');
}

export function padovaPageUrl(page: string): string {
  return `${padovaAppBaseUrl()}${workspacePath(page)}`;
}

/** Strip common AI-looking tells from outbound staff chat. */
export function polishHumanChat(text: string): string {
  let out = String(text || '').trim();
  out = out.replace(/\u2014|\u2013/g, ','); // em/en dash → comma
  out = out.replace(/\s*,\s*,+/g, ',');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(
    /\b(as an ai|as a language model|i'?m an? ai|i will not invent|never invent|unknown stays unknown|staff only|ai stamp|verify money and parties before treating amounts as final)\b/gi,
    '',
  );
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
  return out.slice(0, 3500);
}

function normChat(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, '');
}

export function isStaffSmalltalkText(text: string): boolean {
  const t = normChat(text);
  if (!t || t.length > 60) return false;
  return /^(how are you|how('?s| is) it going|how('?s| are) things|what'?s up|whats up|you good|you okay|you ok|how's your day|how is your day)\b/.test(
    t,
  );
}

export function isStaffGreetingText(text: string): boolean {
  const t = normChat(text);
  if (!t || t.length > 48) return false;
  if (isStaffSmalltalkText(t)) return false;
  return /^(hi|hello|hey|yo|hola|hiya|sup|good\s*(morning|afternoon|evening)|what can you do|how (can|may) i help)\b/.test(
    t,
  );
}

export function isStaffMenuRequest(text: string): boolean {
  const t = normChat(text);
  if (!t || t.length > 40) return false;
  return /^(help|menu|options|start|commands?)$/.test(t);
}

export function classifyStaffChatIntent(text: string): StaffChatIntent {
  const t = normChat(text);
  if (!t) return 'chat';
  if (isStaffSmalltalkText(t)) return 'smalltalk';
  if (isStaffMenuRequest(t)) return 'menu';
  if (isStaffGreetingText(t)) return 'greeting';
  if (
    /\b(report|summary|summarize|export|breakdown|give me (a |the )?list|full (list|report)|desk report)\b/.test(
      t,
    )
  )
    return 'report';
  if (
    /\b(pending|missing|unpaid|overdue|reminder|status|overview|desk|pulse|backlog|needs?\s*review|open\s*drafts?|how\s*many|anything\s*(open|left|missing|pending)|catch\s*me\s*up)\b/.test(
      t,
    )
  )
    return 'ops';
  if (
    /\b(where|how (do|can|to)|find|open|path|url|link|navigate|go to|screen|page|menu|setup|set\s*up|login|drafts?|attention|accounting|payments?|partnerships?|commissions?|follow[- ]?up|transactions?)\b/.test(
      t,
    ) &&
    /\b(where|how|find|open|path|url|link|page|screen|menu|setup|set\s*up|go to)\b/.test(t)
  )
    return 'guide';
  if (
    /\b(where is|how do i|can'?t find|unable to find|dont know where|don't know where)\b/.test(t)
  )
    return 'guide';
  return 'chat';
}

function shouldShowChoiceMenu(memory?: StaffChatMemory): boolean {
  const count = memory?.helpCount || 0;
  const last = memory?.lastHelpAt || 0;
  if (!count) return true;
  if (Date.now() - last > HELP_COOLDOWN_MS) return true;
  return false;
}

/** Numbered choices, shown only when useful (not every hello). */
export function formatStaffChoiceMenu(): string {
  return [
    '1) File a reservation (PDF, screenshot, or paste)',
    '2) Check pending / missing work',
    '3) Find a screen in Padova',
    '4) Something else, just ask',
  ].join('\n');
}

/**
 * Opening reply for hi / hey / how are you / help.
 * Varies with memory so the same block is not pasted every time.
 */
export function formatStaffOpeningReply(
  text: string,
  memory?: StaffChatMemory,
): { text: string; showedMenu: boolean; kind: StaffChatIntent } {
  const intent = classifyStaffChatIntent(text);
  const showMenu =
    intent === 'menu' ||
    (intent === 'greeting' && shouldShowChoiceMenu(memory)) ||
    (intent === 'smalltalk' && shouldShowChoiceMenu(memory) && (memory?.helpCount || 0) === 0);

  if (intent === 'smalltalk') {
    const openers = [
      "I'm good, thanks. How can I help you today?",
      'Doing well. What do you need?',
      "All good here. What's on your mind?",
    ];
    const idx = (memory?.helpCount || 0) % openers.length;
    const lines = [openers[idx]];
    if (showMenu) {
      lines.push('');
      lines.push(formatStaffChoiceMenu());
    }
    return { text: polishHumanChat(lines.join('\n')), showedMenu: showMenu, kind: 'smalltalk' };
  }

  if (intent === 'menu') {
    return {
      text: polishHumanChat(['Sure. Pick one:', '', formatStaffChoiceMenu()].join('\n')),
      showedMenu: true,
      kind: 'menu',
    };
  }

  // greeting
  const hellos = [
    'Hey, how can I help you today?',
    'Hi. What can I help with?',
    'Hey. What do you need?',
  ];
  const idx = (memory?.helpCount || 0) % hellos.length;
  if (!showMenu) {
    const short = [
      'Hey again. What do you need?',
      'Hi. Still here, just tell me what you need.',
      'Hey. Go ahead.',
    ];
    return {
      text: polishHumanChat(short[(memory?.helpCount || 0) % short.length]),
      showedMenu: false,
      kind: 'greeting',
    };
  }
  return {
    text: polishHumanChat([hellos[idx], '', formatStaffChoiceMenu()].join('\n')),
    showedMenu: true,
    kind: 'greeting',
  };
}

type GuideHit = { keys: RegExp; title: string; page: string; tip: string };

const GUIDE_MAP: GuideHit[] = [
  {
    keys: /\b(draft|drafts|unposted|intake draft)\b/i,
    title: 'Drafts',
    page: 'Bookings',
    tip: 'Open Bookings. Drafts sit in the Drafts block under the booking list. Continue a row there, review, then Save Booking.',
  },
  {
    keys: /\b(booking|bookings|transaction|transactions|sale list)\b/i,
    title: 'Bookings',
    page: 'Bookings',
    tip: 'Main booking list is Bookings (Transactions). New booking is there too.',
  },
  {
    keys: /\b(attention|needs attention|needs review|follow.?up lists?)\b/i,
    title: 'Attention',
    page: 'Attention',
    tip: 'Open Attention for missing info, unpaid, and other follow-ups.',
  },
  {
    keys: /\b(follow[- ]?up|tasks?)\b/i,
    title: 'Follow-up',
    page: 'Follow-up',
    tip: 'Follow-up lists live under Follow-up / Tasks.',
  },
  {
    keys: /\b(payment|payments|receipt|receipts|paid)\b/i,
    title: 'Payments',
    page: 'Payments',
    tip: 'Customer receipts and allocations are under Payments.',
  },
  {
    keys: /\b(accounting|profit|pnl|cash|report screen)\b/i,
    title: 'Accounting',
    page: 'Accounting',
    tip: 'Month view and money reports are under Accounting (needs permission).',
  },
  {
    keys: /\b(commission|commissions|referral payable)\b/i,
    title: 'Commissions',
    page: 'Commissions',
    tip: 'Commission receivables and payables are under Commissions.',
  },
  {
    keys: /\b(partner|partnerships?|affiliate|org share)\b/i,
    title: 'Partnerships',
    page: 'Partnerships',
    tip: 'Org pipeline, notes, and referral links to bookings are under Partnerships.',
  },
  {
    keys: /\b(people|customer|traveler|family)\b/i,
    title: 'People',
    page: 'People & Families',
    tip: 'Customers and travelers are under People & Families. Search before creating.',
  },
  {
    keys: /\b(supplier|suppliers)\b/i,
    title: 'Suppliers',
    page: 'Suppliers',
    tip: 'Travel providers and payables start under Suppliers.',
  },
  {
    keys: /\b(settings|users|permission|login)\b/i,
    title: 'Settings',
    page: 'Settings',
    tip: 'Staff users and permissions are under Settings / Users & Permissions.',
  },
  {
    keys: /\b(whatsapp|helper|bridge|qr)\b/i,
    title: 'WhatsApp helper',
    page: 'Dashboard',
    tip: 'The PC helper stays on your computer. Start it there, link once with QR, leave it running. This chat is that bridge talking to Padova.',
  },
];

export function formatStaffGuideReply(question: string): string {
  const q = String(question || '');
  const base = padovaAppBaseUrl();
  const hits = GUIDE_MAP.filter((g) => g.keys.test(q));
  if (!hits.length) {
    return polishHumanChat(
      [
        `Padova QA is ${base}`,
        '',
        `Bookings: ${padovaPageUrl('Bookings')}`,
        `Drafts: same Bookings page, Drafts section`,
        `Attention: ${padovaPageUrl('Attention')}`,
        `Payments: ${padovaPageUrl('Payments')}`,
        `Accounting: ${padovaPageUrl('Accounting')}`,
        `Partnerships: ${padovaPageUrl('Partnerships')}`,
        '',
        'Tell me what you are looking for and I will point you straight there.',
      ].join('\n'),
    );
  }
  const lines: string[] = [];
  for (const hit of hits.slice(0, 3)) {
    lines.push(`${hit.title}: ${padovaPageUrl(hit.page)}`);
    lines.push(hit.tip);
    lines.push('');
  }
  lines.push('If that is not the screen you meant, say what you are trying to do and I will redirect.');
  return polishHumanChat(lines.join('\n'));
}

/** Default first-touch greeting with clean choices. */
export function formatStaffGreeting(memory?: StaffChatMemory): string {
  return formatStaffOpeningReply('hi', memory).text;
}

export function formatStaffOpsBriefing(input: {
  as_of: string;
  counts: Record<string, number>;
  items: { kind: string; title: string; detail?: string; urgency: string }[];
  full?: boolean;
}): string {
  const counts = input.counts || {};
  const items = input.items || [];
  const drafts = counts['Open draft'] || 0;
  const intakeReview = counts['Intake needs review'] || 0;
  const missingSale = counts['Missing sale price'] || 0;
  const missingTraveler = counts['Traveler missing'] || 0;
  const unpaid = counts['Customer unpaid'] || 0;
  const commission = counts['Commission due'] || 0;

  if (!items.length) {
    return polishHumanChat(
      `Checked Padova for ${input.as_of}. Nothing sitting in reminders. Send a file whenever you want the next draft.`,
    );
  }

  const lines = [
    input.full
      ? `Desk report for ${input.as_of} (${items.length} open):`
      : `Quick desk check for ${input.as_of}:`,
  ];
  if (drafts) lines.push(`${drafts} open draft${drafts === 1 ? '' : 's'}`);
  if (intakeReview) lines.push(`${intakeReview} intake needing a look`);
  if (missingSale) lines.push(`${missingSale} missing sale price`);
  if (missingTraveler) lines.push(`${missingTraveler} missing traveler`);
  if (unpaid) lines.push(`${unpaid} unpaid balance`);
  if (commission) lines.push(`${commission} commission due`);

  const top = items.slice(0, input.full ? 18 : 6);
  lines.push('');
  lines.push(input.full ? 'List:' : 'Top of pile:');
  for (const item of top) {
    const bit = item.detail ? `${item.title}. ${item.detail}` : item.title;
    lines.push(`- ${bit}`);
  }
  if (items.length > top.length) {
    lines.push(`Plus ${items.length - top.length} more in Attention: ${padovaPageUrl('Attention')}`);
  } else {
    lines.push(`Attention board: ${padovaPageUrl('Attention')}`);
  }
  lines.push('Want detail on one of these, or a path to fix it in the app?');
  return polishHumanChat(lines.join('\n'));
}

async function callStaffChatModel(
  provider: AiProvider,
  key: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI ${response.status}: ${redactOperationalText(errText).slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return String(payload.choices?.[0]?.message?.content || '');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(AI_CHAT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Claude ${response.status}: ${redactOperationalText(errText).slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (payload.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

const STAFF_CHAT_SYSTEM = `You are Padova's in-house ops desk for travel staff on WhatsApp.
Write like a sharp human colleague: short, calm, professional, natural.
No em dashes. No en dashes. No bullet sermons. No "As an AI". No markdown fences.
Do not invent sale, cost, payment, ownership, dates, or parties.
If a fact is missing from CONTEXT, say you do not have it yet and point them to the app path/URL from CONTEXT when relevant.
You may guide navigation, explain setup, and turn CONTEXT into a plain report.
Keep replies under 1200 characters when possible.
Never invent money amounts.`;

/**
 * LLM staff reply grounded on provided facts. Falls back to deterministic copy.
 */
export async function draftStaffChatReply(input: {
  question: string;
  intent: StaffChatIntent;
  contextBlock: string;
  fallback: string;
}): Promise<{ text: string; used_ai: boolean }> {
  const fallback = polishHumanChat(input.fallback);
  if (!aiIntakeEnabled()) return { text: fallback, used_ai: false };
  const resolved = resolveAiApiKey();
  if (!resolved) return { text: fallback, used_ai: false };

  const system = STAFF_CHAT_SYSTEM;
  const user = [
    `Intent: ${input.intent}`,
    `App base: ${padovaAppBaseUrl()}`,
    'CONTEXT (facts only):',
    input.contextBlock.slice(0, 6000) || '(none)',
    '',
    'Staff message:',
    redactOperationalText(input.question).slice(0, 1500),
  ].join('\n');

  try {
    const raw = await callStaffChatModel(
      resolved.provider,
      resolved.key,
      aiModel(resolved.provider),
      system,
      user,
    );
    const text = polishHumanChat(stripClaudeMarkdownFence(raw));
    if (!text || text.length < 8) return { text: fallback, used_ai: false };
    return { text, used_ai: true };
  } catch {
    return { text: fallback, used_ai: false };
  }
}
