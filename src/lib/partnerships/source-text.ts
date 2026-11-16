export function ownMessageText(body: string): string {
  const own = body.split(
    /<blockquote\b|<div[^>]*class=["'][^"']*gmail_quote|\r?\n(?:On [\s\S]{0,300}?wrote:|From:|_{4,}|>)/i,
  )[0];
  return own
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>|<\/div>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}
export function classifyCampaign(body: string, originalLabel = ''): string {
  // Only the new text is considered. Quoted ancestors remain in the preserved body.
  const own = ownMessageText(body);
  const direct =
    /book(?:ing)?\s+(?:directly?\s+)?(?:with|through)\s+(?:me|us|padova)|direct[- ]referral|(?:15|25)\s*%\s*(?:of\s*)?(?:my|our|the)?\s*(?:earnings|profit)/i.test(
      own,
    );
  const affiliate =
    /affiliate\s+links?|placing\s+.{0,30}links|links\s+on\s+your\s+(?:web)?site/i.test(own);
  if (direct) return 'historical_direct';
  if (affiliate && !direct) return 'historical_affiliate';
  if (/current|new campaign/i.test(originalLabel)) return 'current_direct';
  return 'historical_unclear';
}
