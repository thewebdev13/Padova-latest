/** Conservative reference-only matching. Never use these heuristics to post live finance. */
export const referenceKey = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');

type Evidence = { id: string; evidence_class: string; raw: Record<string, any> };
export function confirmedCustomerGroups(aliases: Evidence[], decisions: Evidence[]) {
  const targets = new Map<string, Map<string, { name: string; evidence: string[] }>>();
  const separate = new Set<string>();
  const pair = (a: string, b: string) => [referenceKey(a), referenceKey(b)].sort().join('|');
  const add = (from: string, to: string, evidence: string[]) => {
    if (!from?.trim() || !to?.trim()) return;
    const key = referenceKey(from),
      targetKey = referenceKey(to);
    if (separate.has(pair(from, to))) return;
    const candidates = targets.get(key) ?? new Map();
    const previous = candidates.get(targetKey);
    candidates.set(targetKey, {
      name: to,
      evidence: [...new Set([...(previous?.evidence ?? []), ...evidence])],
    });
    targets.set(key, candidates);
  };
  const confirmed = decisions.filter((e) => e.evidence_class === 'owner_confirmed_answer');
  for (const e of confirmed) {
    if (!/^keep separate$/i.test(e.raw.answer?.trim() ?? '')) continue;
    const names = [...String(e.raw.question ?? '').matchAll(/“([^”]+)”/g)].map((m) => m[1]);
    for (const a of names)
      for (const b of names) if (referenceKey(a) !== referenceKey(b)) separate.add(pair(a, b));
  }
  for (const e of aliases)
    if (e.evidence_class.startsWith('owner_confirmed_name_group'))
      add(e.raw.original_label, e.raw.current_label, [e.id, ...(e.raw.owner_decision_ids ?? [])]);
  let declarations = 0;
  const approvedGroups: { decisionId: string; evidenceId: string; name: string }[] = [];
  for (const e of confirmed) {
    const answer = String(e.raw.answer ?? '').trim();
    const match = answer.match(/^combine(?: all| these)? as\s+(.+)$/i);
    const sourceTargets = aliases
      .filter((a) => a.raw.owner_decision_ids?.includes(e.raw.decision_id))
      .map((a) => a.raw.current_label);
    // The preserved alias table supplies the exact chosen name for answers without
    // a "Combine as" prefix (and retains subsequent owner spelling corrections).
    const canonical =
      sourceTargets.length && new Set(sourceTargets.map(referenceKey)).size === 1
        ? sourceTargets[0]
        : (match?.[1] ?? (answer.startsWith('as ') ? answer.slice(3).split('\n')[0] : undefined));
    if (!canonical) continue;
    declarations++;
    approvedGroups.push({ decisionId: e.raw.decision_id, evidenceId: e.id, name: canonical });
    const question = String(e.raw.question ?? '');
    const contextStart = question.search(
      /I.ll (?:keep|preserve|put)|keeping|including canceled|Every original/i,
    );
    const identityText = contextStart >= 0 ? question.slice(0, contextStart) : question;
    for (const name of [...identityText.matchAll(/“([^”]+)”/g)].map((m) => m[1]))
      add(name, canonical, [e.id, e.raw.decision_id]);
    add(canonical, canonical, [e.id, e.raw.decision_id]);
  }
  const resolve = (name: string) => {
    const found = targets.get(referenceKey(name));
    if (!found || found.size !== 1) return undefined;
    const candidate = [...found.values()][0];
    return separate.has(pair(name, candidate.name)) ? undefined : candidate;
  };
  return {
    resolve,
    declarations,
    approvedGroups,
    aliasCount: targets.size,
    conflicts: [...targets].filter(([, values]) => values.size > 1).map(([key]) => key),
  };
}

export const directoryContextLabel = (value: string) =>
  /\b(paid|pay|fees?|change\d*|voucher|vouch|credit|refund|loss|charge|booking|cancel|bags?|seats?|itinerary|itenerary|friends?|freinds?)\b/i.test(
    value,
  );
export function singleTravelerLabel(value: string) {
  const clean = value.trim();
  return (
    /^[\p{L}][\p{L}\p{M}'’ .-]+$/u.test(clean) &&
    clean.split(/\s+/).length >= 2 &&
    !/\b(fam|family|infant|child|seats?|fees?|change|bag|hotel|booking|personal|unknown|passengers?)\b/i.test(
      clean,
    )
  );
}
export function sourceName(value: string) {
  const clean = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
    if (url.hostname.includes('.') && !url.hostname.includes(' '))
      return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {}
  return clean.length <= 100 && !/[\n\r@]/.test(clean) ? clean : '';
}
