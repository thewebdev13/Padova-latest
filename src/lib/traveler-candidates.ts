import { singleTravelerLabel, referenceKey } from './test-reference';
export function similarTravelerName(a: string, b: string) {
  const x = referenceKey(a),
    y = referenceKey(b);
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 6 || Math.abs(x.length - y.length) > 2) return false;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++)
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[y.length] <= 2;
}

/** Candidate parsing only. No name similarity can establish that two people are one. */
export function travelerCandidates(raw: string) {
  const clean = raw.trim();
  const parts = clean
    .split(/\r?\n|\s*;\s*|\s*\|\s*|\s+&\s+|\s+and\s+|\s+\/\s+|\s*,\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const safe = (s: string) =>
    singleTravelerLabel(s) &&
    s.split(/\s+/).length <= 5 &&
    !/\b(and|with|plus|tbd|cancelled|canceled|total|adults?|children|pax)\b/i.test(s);
  if (parts.length > 1)
    return parts.every(safe)
      ? { names: parts, split: true, review: false }
      : { names: [], split: false, review: true };
  return safe(clean)
    ? { names: [clean], split: false, review: false }
    : { names: [], split: false, review: true };
}
export function exactIdentityKey(
  name: string,
  identifiers: { dob?: string; email?: string; phone?: string } = {},
) {
  const evidence = Object.entries(identifiers)
    .filter(([, v]) => v?.trim())
    .sort();
  return evidence.length ? `${referenceKey(name)}:${JSON.stringify(evidence)}` : null;
}
