// Module A: Anti-Slop.
// A writing linter for resumes, cover notes and recruiter emails. It flags the
// stock phrases that make text read as generic filler, explains why, and offers
// a plainer word. It is used in three places:
//   1. Every writing prompt lists BANNED_PHRASES as words the model must not use.
//   2. Every model draft is scanned before the person sees it; a draft with hits
//      is sent back once for a rewrite.
//   3. The person can paste any text into the checker on a job page.

export const BANNED_PHRASES = [
  'delve',
  'testament to',
  'game-changer',
  'landscape',
  'fostering',
  'tapestry',
  'plethora',
  'underscores',
  'paramount',
  'spearheaded',
  'unwavering',
  'digital age',
  'meticulous',
  'navigating',
  'poised to',
  'rich history',
] as const;

export type BannedPhrase = (typeof BANNED_PHRASES)[number];

type Rule = {
  // Word forms that count as the same phrase ("delve" also catches "delved", "delving").
  forms: string[];
  // A plainer replacement, or null when the honest fix is to cut the phrase
  // and state the concrete fact instead.
  replacement: string | null;
  why: string;
};

export const RULES: Record<BannedPhrase, Rule> = {
  delve: { forms: ['delve', 'delves', 'delved', 'delving'], replacement: 'dig into', why: 'Say what you examined.' },
  'testament to': { forms: ['testament to', 'a testament to'], replacement: 'shows', why: 'State the evidence directly.' },
  'game-changer': { forms: ['game-changer', 'game changer', 'game-changers', 'game changers', 'game-changing', 'game changing'], replacement: null, why: 'Name the change and its result instead.' },
  landscape: { forms: ['landscape', 'landscapes'], replacement: 'market', why: 'Name the actual market, field or team.' },
  fostering: { forms: ['foster', 'fosters', 'fostered', 'fostering'], replacement: 'building', why: 'Say what you built and how.' },
  tapestry: { forms: ['tapestry', 'tapestries'], replacement: null, why: 'Decorative filler; cut it.' },
  plethora: { forms: ['plethora', 'a plethora of'], replacement: 'many', why: 'Give the number if you have it.' },
  underscores: { forms: ['underscore', 'underscores', 'underscored', 'underscoring'], replacement: 'shows', why: 'Plain verbs read faster.' },
  paramount: { forms: ['paramount'], replacement: 'essential', why: 'Overstated; say why it matters.' },
  spearheaded: { forms: ['spearhead', 'spearheads', 'spearheaded', 'spearheading'], replacement: 'led', why: '"Led" is shorter and recruiters scan for it.' },
  unwavering: { forms: ['unwavering'], replacement: null, why: 'Unprovable adjective; cut it and show the result.' },
  'digital age': { forms: ['digital age', "today's digital age", 'in the digital age'], replacement: null, why: 'Says nothing; cut it.' },
  meticulous: { forms: ['meticulous', 'meticulously'], replacement: 'careful', why: 'Show the accuracy with a number instead.' },
  navigating: { forms: ['navigate', 'navigates', 'navigated', 'navigating'], replacement: 'handling', why: 'Say what you handled.' },
  'poised to': { forms: ['poised to'], replacement: 'set to', why: 'Plainer and less salesy.' },
  'rich history': { forms: ['rich history', 'a rich history'], replacement: null, why: 'State the fact: founded in, years, scale.' },
};

export type SlopHit = {
  phrase: string;
  match: string;
  index: number;
  length: number;
  replacement: string | null;
  why: string;
  context: string;
};

export type SlopReport = {
  score: number;      // 100 = clean; each hit costs points
  clean: boolean;
  hits: SlopHit[];
  counts: Record<string, number>;
  words: number;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One regex per phrase. Hyphens and spaces are interchangeable; matches stop at
// word boundaries so "landscaped" or "fosterage" are not flagged.
const PATTERNS: [BannedPhrase, RegExp][] = BANNED_PHRASES.map((p) => {
  const alts = [...RULES[p].forms]
    .sort((a, b) => b.length - a.length)
    .map((f) => escape(f).replace(/\\-|\s+|-/g, '[\\s\\-]+'));
  return [p, new RegExp(`(?<![\\w-])(?:${alts.join('|')})(?![\\w-])`, 'gi')];
});

const PENALTY_PER_HIT = 8;

// Extra words the person added in Settings ("stored banned words"): no replacement, just cut.
const extraCache = new Map<string, RegExp>();
function extraPattern(word: string) {
  let re = extraCache.get(word);
  if (!re) {
    re = new RegExp(`(?<![\\w-])${escape(word).replace(/\\-|\s+|-/g, '[\\s\\-]+')}(?![\\w-])`, 'gi');
    extraCache.set(word, re);
  }
  return re;
}
const EXTRA_RULE = { replacement: null, why: 'On your own banned list in Settings.' };

export function parseExtraBanned(raw: string | null | undefined): string[] {
  return [...new Set(String(raw || '').split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 60))].slice(0, 100);
}

export function scanSlop(text: string, extra: string[] = []): SlopReport {
  const src = String(text ?? '');
  const hits: SlopHit[] = [];
  const patterns: [string, RegExp, { replacement: string | null; why: string }][] = [
    ...PATTERNS.map(([p, re]) => [p, re, RULES[p]] as [string, RegExp, Rule]),
    ...extra.filter((w) => !(BANNED_PHRASES as readonly string[]).includes(w)).map((w) => [w, extraPattern(w), EXTRA_RULE] as [string, RegExp, typeof EXTRA_RULE]),
  ];
  for (const [phrase, re, rule] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(src.length, m.index + m[0].length + 40);
      hits.push({
        phrase,
        match: m[0],
        index: m.index,
        length: m[0].length,
        replacement: rule.replacement,
        why: rule.why,
        context: `${start > 0 ? '…' : ''}${src.slice(start, end).replace(/\s+/g, ' ')}${end < src.length ? '…' : ''}`,
      });
    }
  }
  // Longer phrases can contain shorter ones; keep the first, longest match per span.
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const kept: SlopHit[] = [];
  let until = -1;
  for (const h of hits) {
    if (h.index < until) continue;
    kept.push(h);
    until = h.index + h.length;
  }
  const counts: Record<string, number> = {};
  for (const h of kept) counts[h.phrase] = (counts[h.phrase] ?? 0) + 1;
  const words = src.trim() ? src.trim().split(/\s+/).length : 0;
  return {
    score: Math.max(0, 100 - kept.length * PENALTY_PER_HIT),
    clean: kept.length === 0,
    hits: kept,
    counts,
    words,
  };
}

// Swaps every hit that has a one-word replacement, keeping the first letter's case.
// Hits without a safe replacement are left for the person (or the model) to rewrite.
export function applySafeFixes(text: string, extra: string[] = []): { text: string; fixed: number; remaining: SlopHit[] } {
  const report = scanSlop(text, extra);
  let out = '';
  let last = 0;
  let fixed = 0;
  const remaining: SlopHit[] = [];
  for (const h of report.hits) {
    if (!h.replacement) {
      remaining.push(h);
      continue;
    }
    const rep = /^[A-Z]/.test(h.match) ? h.replacement[0].toUpperCase() + h.replacement.slice(1) : h.replacement;
    out += text.slice(last, h.index) + rep;
    last = h.index + h.length;
    fixed++;
  }
  out += text.slice(last);
  return { text: out, fixed, remaining };
}

// The spec's entry point: { hasSlop, findings } for any text.
export function scanForSlop(text: string, extra: string[] = []): { hasSlop: boolean; findings: string[] } {
  const r = scanSlop(text, extra);
  return { hasSlop: !r.clean, findings: [...new Set(r.hits.map((h) => h.match.toLowerCase()))] };
}

export const slopRejection = (findings: string[]) => `Draft rejected due to low-quality AI patterns: ${findings.join(', ')}.`;

// The instruction block every writing prompt includes.
export function antiSlopInstruction(extra: string[] = []) {
  return `Style rules: write plain, specific English. Never use these words or phrases (or their other forms): ${[...BANNED_PHRASES, ...extra].map((p) => `"${p}"`).join(', ')}. Prefer concrete verbs ("led", "built", "cut", "hired") and real numbers from the source.`;
}

// Text the model can act on when its draft has hits.
export function rewriteRequest(report: SlopReport) {
  const list = report.hits.map((h) => `"${h.match}"${h.replacement ? ` (use "${h.replacement}" or rephrase)` : ' (cut it and state the fact)'}`);
  return `Your draft used banned phrases: ${[...new Set(list)].join('; ')}. Rewrite it without them. Keep every fact, keep the same JSON shape, and reply with the JSON only.`;
}

// Collects every string inside a JSON value, for scanning model output.
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join('\n');
  return '';
}
