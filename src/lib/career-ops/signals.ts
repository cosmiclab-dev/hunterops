// Posting legitimacy (Career-Ops Block G), the parts that need no AI:
// is the posting still open, how old is it, has it been reposted, does it show pay.
// Closed-page phrases follow career-ops liveness-core.mjs (MIT, santifer/career-ops).
// A bot-check page counts as "unknown": it is reported, never worked around.
import { prisma } from '../db';
import { loadJobPage } from '../job-page';
import { normalizeTerm } from '../modules/grill';

export const CLOSED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /\b(?:job|position|role|posting|opening|vacancy|requisition)\b[\s\S]{0,60}?has been filled\b/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this (?:job|role|position)(?: listing)? is closed\b/i,
  /job (listing )?not found/i,
  /can't view this job because it's not available/i,
  /the page you are looking for doesn.t exist/i,
  /applications?\s+(?:(?:have|are|is)\s+)?closed/i,
  /\bjob expired\b/i,
];

export { BOT_CHECK_PATTERNS } from '../bot-check';
import { BOT_CHECK_PATTERNS } from '../bot-check';

export type Liveness = { state: 'open' | 'closed' | 'unknown'; reason: string; checkedAt: string };

export function livenessFromText(text: string): Omit<Liveness, 'checkedAt'> {
  const head = text.slice(0, 4000);
  const closed = CLOSED_PATTERNS.find((re) => re.test(head));
  if (closed) return { state: 'closed', reason: `The page says "${head.match(closed)![0].trim()}".` };
  if (BOT_CHECK_PATTERNS.some((re) => re.test(head)) && text.length < 3000) return { state: 'unknown', reason: 'The site showed a human check, so it could not be read.' };
  if (text.trim().length < 300) return { state: 'unknown', reason: 'The page had almost no text.' };
  return { state: 'open', reason: 'The posting is still up.' };
}

export async function checkLiveness(url: string, board?: { atsType: string; atsSlug: string } | null): Promise<Liveness & { description?: string }> {
  const checkedAt = new Date().toISOString();
  try {
    const page = await loadJobPage(url, board);
    if (page.ats) return { state: 'open', reason: `${page.ats} still lists this posting.`, checkedAt, description: page.description };
    return { ...livenessFromText(page.description), checkedAt, description: page.description };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 410) return { state: 'closed', reason: `The posting is gone (HTTP ${status}).`, checkedAt };
    return { state: 'unknown', reason: `Could not check: ${(err as Error).message}`, checkedAt };
  }
}

// Titles compared without seniority noise, so "Sr. TA Partner" and "Senior TA Partner" match.
export function titleKey(title: string) {
  return normalizeTerm(title)
    .replace(/\b(sr|senior|jr|junior|lead|principal|staff|i{1,3}|iv|\d+)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Repost = { count: number; firstSeen: string | null; urls: string[] };

// Same company and a matching title under a different link in the last 90 days.
export async function findReposts(job: { id: string; company: string; title: string; url: string }): Promise<Repost> {
  const since = new Date(Date.now() - 90 * 864e5);
  const rows = await prisma.job.findMany({
    where: { id: { not: job.id }, company: { equals: job.company, mode: 'insensitive' }, firstSeenAt: { gte: since } },
    select: { title: true, url: true, firstSeenAt: true },
    take: 200,
  });
  const key = titleKey(job.title);
  const same = rows.filter((r) => r.url !== job.url && titleKey(r.title) === key);
  same.sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
  return { count: same.length, firstSeen: same[0]?.firstSeenAt.toISOString() ?? null, urls: same.slice(0, 5).map((r) => r.url) };
}

export type Signal = { id: string; label: string; tone: 'good' | 'mixed' | 'concern' | 'unknown'; detail: string };

export function postingAgeSignal(postedAt: Date | null, firstSeenAt: Date, now = Date.now()): Signal {
  const from = postedAt ?? firstSeenAt;
  const days = Math.max(0, Math.floor((now - from.getTime()) / 864e5));
  const basis = postedAt ? 'posted' : 'first seen by HunterOps';
  if (days < 30) return { id: 'age', label: 'Posting age', tone: 'good', detail: `${days} days since ${basis}.` };
  if (days < 60) return { id: 'age', label: 'Posting age', tone: 'mixed', detail: `${days} days since ${basis}. Some roles take this long; worth asking where it stands.` };
  return { id: 'age', label: 'Posting age', tone: 'concern', detail: `${days} days since ${basis}. Senior or niche roles can stay open this long, but it may also be an evergreen listing.` };
}

export function legitimacySignals(a: { liveness: Liveness; repost: Repost; postedAt: Date | null; firstSeenAt: Date; salary: string | null; description: string }): Signal[] {
  const out: Signal[] = [];
  out.push({
    id: 'live', label: 'Still open',
    tone: a.liveness.state === 'open' ? 'good' : a.liveness.state === 'closed' ? 'concern' : 'unknown',
    detail: a.liveness.reason,
  });
  out.push(postingAgeSignal(a.postedAt, a.firstSeenAt));
  out.push(a.repost.count >= 2
    ? { id: 'repost', label: 'Reposted', tone: 'concern', detail: `The same role appeared ${a.repost.count} more times in 90 days under other links. Reposts can mean a hard-to-fill role or an evergreen listing.` }
    : a.repost.count === 1
      ? { id: 'repost', label: 'Reposted', tone: 'mixed', detail: 'The same role appeared once before under another link in the last 90 days.' }
      : { id: 'repost', label: 'Reposted', tone: 'good', detail: 'No repost of this role seen in the last 90 days.' });
  out.push(a.salary
    ? { id: 'pay', label: 'Pay shown', tone: 'good', detail: `The posting states pay: ${a.salary}.` }
    : { id: 'pay', label: 'Pay shown', tone: 'unknown', detail: 'No pay range. Common in India and not a warning on its own.' });
  const words = a.description.split(/\s+/).filter(Boolean).length;
  out.push(words < 120
    ? { id: 'detail', label: 'Detail in the description', tone: 'mixed', detail: `Only about ${words} words. Thin descriptions are common for ghost listings, and for rushed ones.` }
    : { id: 'detail', label: 'Detail in the description', tone: 'good', detail: `About ${words} words of role detail.` });
  return out;
}
