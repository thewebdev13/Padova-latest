/** Client-safe intake splitting (no Node crypto). */

/** Split one CSV line respecting double-quoted fields (commas inside quotes). */
export function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cols.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

/** Turn a CSV table into Field: Value blocks (one booking per data row). */
export function csvToIntakeBlocks(raw: string): string[] {
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes(',')) return [];
  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) return [];
  const blocks: string[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const pairs = headers.map((h, i) => (cols[i] ? `${h}: ${cols[i]}` : '')).filter(Boolean);
    if (pairs.length) blocks.push(pairs.join('\n'));
  }
  return blocks;
}

/**
 * Split one paste/upload into multiple booking entries.
 * Separators: --- on its own line, or a blank line before Product:/Customer:.
 * CSV files become one entry per data row.
 */
export function splitIntakeEntries(raw: string, filename?: string): string[] {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  if (filename && /\.csv$/i.test(filename)) {
    const csv = csvToIntakeBlocks(text);
    if (csv.length) return csv;
  }
  if (!filename && text.includes(',') && /^[^\n]+:/m.test(text) === false) {
    const csv = csvToIntakeBlocks(text);
    if (csv.length > 1) return csv;
  }

  const byDash = text
    .split(/\n\s*---+\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byDash.length > 1) return byDash;

  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  const startsEntry = (line: string, prevBlank: boolean) =>
    prevBlank &&
    /^(product|customer|traveler)\s*:/i.test(line.trim()) &&
    current.some((l) => /^(product|customer|pnr|route)\s*:/i.test(l));

  let prevBlank = false;
  for (const line of lines) {
    const blank = !line.trim();
    if (startsEntry(line, prevBlank) && current.length) {
      blocks.push(current.join('\n').trim());
      current = [line];
      prevBlank = false;
      continue;
    }
    current.push(line);
    prevBlank = blank;
  }
  if (current.length) blocks.push(current.join('\n').trim());
  const useful = blocks.filter((b) => b.length > 0);
  return useful.length ? useful : [text];
}

export const INTAKE_BATCH_SIZE = 25;
export const INTAKE_MAX_ENTRIES = 50_000;

/** Owner-approved email intake mailboxes only (client-safe list). */
export const INTAKE_EMAIL_MAILBOXES = [
  'shmuel@padovatravel.com',
  'mindy@padovatravel.com',
] as const;

function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
  const bin = atob(clean);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** Prefer text/plain from a simple .eml; never invent missing Field: Value facts. */
export function extractTextFromEml(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  const decodeQp = (body: string) =>
    body
      .replace(/=\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );

  const multipart = normalized.match(
    /Content-Type:\s*multipart\/[^;\n]+;\s*boundary="?([^"\n;]+)"?/i,
  );
  if (multipart) {
    const boundary = multipart[1].trim();
    const parts = normalized.split(
      new RegExp(`\\n--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`),
    );
    for (const part of parts) {
      if (!/Content-Type:\s*text\/plain/i.test(part)) continue;
      const split = part.split(/\n\n/);
      if (split.length < 2) continue;
      const headers = split[0];
      let body = split.slice(1).join('\n\n').trim();
      if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) body = decodeQp(body);
      if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
        try {
          body = decodeBase64Utf8(body);
        } catch {
          /* keep undecoded body for review */
        }
      }
      if (body.trim()) return body.trim();
    }
  }

  const headerBreak = normalized.search(/\n\n/);
  const body = headerBreak >= 0 ? normalized.slice(headerBreak + 2) : normalized;
  return decodeQp(body).trim();
}

/** True when raw looks like an RFC822 message (client batch uploads). */
export function looksLikeEml(raw: string, filename?: string): boolean {
  if (filename && /\.eml$/i.test(filename)) return true;
  return /^From:\s/m.test(raw) && /^(MIME-Version|Content-Type):/im.test(raw);
}

function headerValue(raw: string, name: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  const headerBlock = normalized.split(/\n\n/)[0] ?? '';
  const folded = headerBlock.replace(/\n[ \t]+/g, ' ');
  const match = folded.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

function emailAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle?.[1] || raw).trim().toLowerCase();
}

/** Pull From / To / Subject for staff email-forward UI. Never invents booking money fields. */
export function parseEmlEnvelope(raw: string): {
  from_address?: string;
  subject?: string;
  mailbox?: (typeof INTAKE_EMAIL_MAILBOXES)[number];
} {
  const from = emailAddress(headerValue(raw, 'From'));
  const subject = headerValue(raw, 'Subject') || undefined;
  const toLine = [
    headerValue(raw, 'To'),
    headerValue(raw, 'Delivered-To'),
    headerValue(raw, 'X-Original-To'),
  ]
    .filter(Boolean)
    .join(' ');
  const mailbox = INTAKE_EMAIL_MAILBOXES.find((box) =>
    toLine.toLowerCase().includes(box.toLowerCase()),
  );
  return {
    from_address: from || undefined,
    subject,
    mailbox,
  };
}
