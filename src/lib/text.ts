// HTML to readable plain text, for job descriptions pulled from ATS APIs.
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•',
};

export function decodeEntities(s: string | null | undefined) {
  return String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string | null | undefined, max = 20000) {
  if (!html) return null;
  // Greenhouse double-encodes its HTML, so decode first, then strip tags.
  let s = decodeEntities(html);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
