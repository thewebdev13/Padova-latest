/**
 * Instinct-style continuity for WhatsApp intake:
 * several screenshots of one receipt → one draft, not three bookings.
 * Never invents money; only merges extracted text / known fields.
 */

export function extractBookingFingerprints(text: string): string[] {
  const raw = String(text || '');
  const out = new Set<string>();
  const push = (v: string) => {
    const t = v.replace(/\s+/g, '').toUpperCase();
    if (t.length >= 5 && t.length <= 18) out.add(t);
  };

  for (const m of raw.matchAll(
    /\b(?:confirmation(?:\s*codes?)?|pnr|record\s*locator|trip\s*id|booking\s*(?:ref|id)|ticket(?:\s*number)?)\s*[:#-]?\s*([A-Z0-9-]{5,18})\b/gi,
  )) {
    if (m[1]) push(m[1]);
  }
  // Standalone airline / GDS style codes (AKF8D9, etc.)
  for (const m of raw.matchAll(/\b([A-Z0-9]{6,8})\b/g)) {
    const v = m[1];
    if (v && /[A-Z]/.test(v) && /\d/.test(v)) push(v);
  }
  for (const m of raw.matchAll(/\b(H-[A-Z0-9]{4,12})\b/gi)) {
    if (m[1]) push(m[1]);
  }
  for (const m of raw.matchAll(/\b(\d{13})\b/g)) {
    // ticket numbers
    push(m[1]);
  }
  for (const m of raw.matchAll(/\b([A-Z]{2}\s?\d{2,4})\b/g)) {
    // flight numbers e.g. TG617
    push(m[1].replace(/\s+/g, ''));
  }
  return [...out];
}

export function fingerprintsOverlap(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const setB = new Set(b.map((x) => x.toUpperCase()));
  return a.some((x) => setB.has(x.toUpperCase()));
}

export function shouldMergeMediaIntoOpenDraft(input: {
  openRawText: string;
  openCreatedAt?: string | Date | null;
  newText: string;
  openChat?: string;
  newChat?: string;
  maxAgeMinutes?: number;
}): boolean {
  const maxAge = (input.maxAgeMinutes ?? 20) * 60_000;
  if (input.openCreatedAt) {
    const t = new Date(input.openCreatedAt).getTime();
    if (Number.isFinite(t) && Date.now() - t > maxAge) return false;
  }
  const openFp = extractBookingFingerprints(input.openRawText);
  const newFp = extractBookingFingerprints(input.newText);
  if (fingerprintsOverlap(openFp, newFp)) return true;
  // Same chat, both look like partial receipt pieces, open is still young
  const openChat = String(input.openChat || '').trim();
  const newChat = String(input.newChat || '').trim();
  if (openChat && newChat && openChat === newChat) {
    const openPartial =
      /screenshot|fare details|confirmation codes|passenger|base fare|taxes and fees/i.test(
        input.openRawText,
      );
    const newPartial =
      /screenshot|fare details|confirmation codes|passenger|base fare|taxes and fees|manage your trip/i.test(
        input.newText,
      );
    if (openPartial && newPartial) return true;
  }
  return false;
}

/** Combine OCR/paste pieces for one booking draft. */
export function mergeIntakeRawTexts(parts: string[]): string {
  const cleaned = parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .map((p) => p.replace(/^\[Screenshot text\]\s*/i, '').trim());
  const unique: string[] = [];
  for (const part of cleaned) {
    if (unique.some((u) => u === part)) continue;
    // Drop only near-duplicates (one is almost the same as another).
    if (
      unique.some((u) => {
        if (u.length < 40 || part.length < 40) return false;
        return u.includes(part) || part.includes(u);
      })
    )
      continue;
    unique.push(part);
  }
  return unique.join('\n\n--- next screenshot ---\n\n').slice(0, 50000);
}

export function isLikelyVoiceGreeting(transcript: string): boolean {
  const t = String(transcript || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[!?.…,]+$/g, '');
  if (!t || t.length > 80) return false;
  return /^(hi|hello|hey|yo|hola|hiya|sup|how are you|how('?s| is) it going|what'?s up|whats up|good\s*(morning|afternoon|evening)|thank you|thanks)\b/.test(
    t,
  );
}
