import { quickPasteAIInstructions, parseQuickPaste } from './quick-paste';
import { redactOperationalText } from './operational-redaction';

export type AiProvider = 'openai' | 'anthropic';

/** Server-only key resolution. Prefers OPENAI_API_KEY; accepts Owner key left in ANTHROPIC_API_KEY. */
export function resolveAiApiKey(): { provider: AiProvider; key: string } | null {
  const openai = String(process.env.OPENAI_API_KEY || '').trim();
  const anthropic = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const raw = openai || anthropic;
  if (!raw) return null;
  if (raw.startsWith('sk-ant-')) return { provider: 'anthropic', key: raw };
  // sk-proj-… / sk-… → OpenAI (Owner-supplied ChatGPT/API key)
  if (openai || raw.startsWith('sk-proj-') || raw.startsWith('sk-')) {
    return { provider: 'openai', key: raw };
  }
  // Unknown shape — try Anthropic if explicitly only that env, else OpenAI
  if (anthropic && !openai) return { provider: 'anthropic', key: anthropic };
  return { provider: 'openai', key: raw };
}

/** Feature flag — QA/local only until Owner promotes. */
export function aiIntakeEnabled(): boolean {
  const flag = String(process.env.PADOVA_AI_INTAKE || '').trim();
  if (flag === '0' || /^false$/i.test(flag)) return false;
  if (flag === '1' || /^true$/i.test(flag)) return true;
  return Boolean(resolveAiApiKey());
}

/** Owner 1B: auto-create live booking when safe. Default on when intake AI is on. */
export function aiAutoLiveEnabled(): boolean {
  const flag = String(process.env.PADOVA_AI_AUTO_LIVE || '').trim();
  if (flag === '0' || /^false$/i.test(flag)) return false;
  if (flag === '1' || /^true$/i.test(flag)) return true;
  return aiIntakeEnabled();
}

export function claudeApiConfigured(): boolean {
  return Boolean(resolveAiApiKey());
}

export function aiApiConfigured(): boolean {
  return claudeApiConfigured();
}

export function aiProvider(): AiProvider | null {
  return resolveAiApiKey()?.provider ?? null;
}

export function aiModel(provider?: AiProvider | null): string {
  const explicit = String(process.env.PADOVA_AI_MODEL || '').trim();
  if (explicit) return explicit;
  const p = provider ?? aiProvider();
  return p === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o';
}

/** @deprecated use aiModel */
export function claudeModel(): string {
  return aiModel();
}

export function aiIntakeStatus() {
  const resolved = resolveAiApiKey();
  return {
    enabled: aiIntakeEnabled(),
    auto_live: aiAutoLiveEnabled(),
    api_configured: Boolean(resolved),
    provider: resolved?.provider ?? null,
    model: resolved ? aiModel(resolved.provider) : null,
    posts_money: false,
    invents_amounts: false,
  };
}

/** How many known Field:Value keys parseQuickPaste already sees. */
export function countRecognizedPasteFields(raw: string): number {
  return Object.keys(parseQuickPaste(raw).fields).length;
}

/** True when paste already looks structured enough to skip LLM. */
export function looksLikeStructuredPaste(raw: string): boolean {
  return countRecognizedPasteFields(raw) >= 5;
}

export function stripClaudeMarkdownFence(text: string): string {
  let out = text.trim();
  if (/^```/.test(out)) {
    out = out.replace(/^```(?:[\w-]*)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return out.trim();
}

export function aiDisclaimerLine(provider?: AiProvider | null): string {
  const p = provider ?? aiProvider();
  const label = p === 'anthropic' ? 'Claude AI' : p === 'openai' ? 'OpenAI' : 'AI';
  return `Created by ${label} from inbound reservation text. Verify money and parties. Missing amounts stay Unknown.`;
}

export type ClaudeExtractResult = {
  used: boolean;
  paste: string;
  model?: string;
  provider?: AiProvider;
  skipped_reason?: string;
  error?: string;
  summary?: string;
};

const SYSTEM_EXTRA = `Additional rules for Padova server intake:
- Output ONLY Field: Value lines (and keep Notes / Summary as specified).
- Never invent sale, cost, payment, ownership, or dates.
- If a money field is unclear, output that label with Unknown.
- Add a one-line Summary of what was booked when facts exist.
- Do not output API keys, passwords, or full card numbers.`;

/** Keep AI off the hang path — Vercel/cron friendly. */
const AI_FETCH_TIMEOUT_MS = 20_000;

async function callOpenAi(key: string, model: string, userBody: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: `${quickPasteAIInstructions}\n\n${SYSTEM_EXTRA}` },
        { role: 'user', content: userBody },
      ],
    }),
    signal: AbortSignal.timeout(AI_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const safe = redactOperationalText(errText).slice(0, 300).replace(key, '[redacted]');
    throw new Error(`OpenAI API ${response.status}: ${safe || response.statusText}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return String(payload.choices?.[0]?.message?.content || '');
}

async function callAnthropic(key: string, model: string, userBody: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0,
      system: `${quickPasteAIInstructions}\n\n${SYSTEM_EXTRA}`,
      messages: [{ role: 'user', content: userBody }],
    }),
    signal: AbortSignal.timeout(AI_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const safe = redactOperationalText(errText).slice(0, 300).replace(key, '[redacted]');
    throw new Error(`Claude API ${response.status}: ${safe || response.statusText}`);
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (payload.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

/**
 * OpenAI (default for Owner key) or Claude → Field:Value only.
 * Never invents money; Unknown when unclear. Server-only.
 */
export async function extractBookingPasteWithClaude(
  rawText: string,
  opts?: { force?: boolean; subject?: string },
): Promise<ClaudeExtractResult> {
  const redacted = redactOperationalText(rawText || '').slice(0, 20000);
  if (!redacted.trim()) {
    return { used: false, paste: '', skipped_reason: 'empty_text' };
  }
  if (!aiIntakeEnabled()) {
    return { used: false, paste: redacted, skipped_reason: 'ai_disabled' };
  }
  const resolved = resolveAiApiKey();
  if (!resolved) {
    return { used: false, paste: redacted, skipped_reason: 'missing_api_key' };
  }
  if (!opts?.force && looksLikeStructuredPaste(redacted)) {
    return { used: false, paste: redacted, skipped_reason: 'already_structured' };
  }

  const { provider, key } = resolved;
  const model = aiModel(provider);
  const userBody = [
    opts?.subject ? `Email subject: ${opts.subject}` : '',
    'Reservation / message text:',
    redacted,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const text =
      provider === 'openai'
        ? await callOpenAi(key, model, userBody)
        : await callAnthropic(key, model, userBody);
    const paste = stripClaudeMarkdownFence(text);
    if (!paste.trim()) {
      return {
        used: false,
        paste: redacted,
        model,
        provider,
        error: `${provider} returned empty extract`,
      };
    }
    const preview = parseQuickPaste(paste);
    const summary =
      typeof preview.fields.reservation_summary === 'string'
        ? preview.fields.reservation_summary
        : undefined;
    return { used: true, paste, model, provider, summary };
  } catch (e) {
    const aborted =
      (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) ||
      (typeof e === 'object' && e && 'name' in e && String((e as { name: string }).name) === 'AbortError');
    return {
      used: false,
      paste: redacted,
      model,
      provider,
      error: aborted
        ? `AI timed out after ${AI_FETCH_TIMEOUT_MS / 1000}s, draft kept for human review`
        : e instanceof Error
          ? e.message
          : 'AI request failed',
    };
  }
}
