import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { atsRef } from '@/lib/job-page';
import { loadSettings } from '@/lib/settings';
import { searchConfig, splitResultTitle, webSearch } from '@/lib/websearch';
import { ATS_TARGETS, LOCATION_PRESETS, WINDOWS, atsQuery, peopleSearches, type LocationKey, type WindowKey } from '@/lib/xray';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  roles: z.array(z.string().max(80)).max(12).default([]),
  locations: z.array(z.enum(Object.keys(LOCATION_PRESETS) as [LocationKey])).default(['bengaluru', 'remote']),
  window: z.enum(Object.keys(WINDOWS) as [WindowKey]).default('d'),
  extra: z.string().max(200).optional().default(''),
  people: z.boolean().default(false),
});

const WINDOW_MS: Record<WindowKey, number> = { d: 864e5, d2: 2 * 864e5, w: 7 * 864e5 };
const LOCATION_CLASSES: Record<LocationKey, string[]> = { bengaluru: ['bengaluru'], india: ['bengaluru', 'india', 'remote_india'], remote: ['remote_india', 'remote_global'] };

// Discover, inside the app: X-Ray results from the web search API (when a key is
// set) plus fresh matches already pulled into HunterOps by the scanner.
export const POST = route(async (req: Request) => {
  const b = Body.parse(await readJson(req));
  const settings = await loadSettings();
  const cfg = searchConfig(settings);
  const input = { roles: b.roles, locations: b.locations, window: b.window, extra: b.extra };

  // 1. Jobs already on the board, fresh within the window.
  const since = new Date(Date.now() - WINDOW_MS[b.window]);
  const roleWords = (b.roles.length ? b.roles : ['recruit', 'talent']).flatMap((r) => r.toLowerCase().split(/\s+/)).filter((w) => w.length > 3 && !['senior', 'lead', 'partner', 'specialist'].includes(w));
  const where: Prisma.JobWhereInput = {
    status: { not: 'DISMISSED' },
    OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }],
    locationClass: { in: [...new Set(b.locations.flatMap((l) => LOCATION_CLASSES[l]))] },
    ...(roleWords.length ? { AND: [{ OR: [...new Set(roleWords)].map((w) => ({ title: { contains: w.replace(/s$/, ''), mode: 'insensitive' as const } })) }] } : {}),
  };
  const board = await prisma.job.findMany({
    where, orderBy: [{ grillScore: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }], take: 60,
    select: { id: true, title: true, company: true, location: true, url: true, source: true, postedAt: true, firstSeenAt: true, grillScore: true, status: true },
  });

  // 2. Live web X-Ray, one query per ATS, in parallel.
  let web: { title: string; company: string; url: string; snippet: string; age: string | null; ats: string; inApp: boolean; jobId: string | null }[] = [];
  const errors: string[] = [];
  let people: { name: string; url: string; snippet: string }[] = [];
  if (cfg) {
    const runs = await Promise.allSettled(ATS_TARGETS.map(async (t) => {
      const results = await webSearch(cfg, atsQuery(t.site, input), b.window, 10);
      return results.map((r) => ({ ...r, ats: t.id }));
    }));
    const seen = new Set<string>();
    for (const r of runs) {
      if (r.status === 'rejected') {
        errors.push((r.reason as Error).message);
        continue;
      }
      for (const x of r.value) {
        // Greenhouse links carry the job in the query (gh_jid, token), so keep those.
        const u = new URL(x.url);
        const id = ['gh_jid', 'token', 'for'].map((k) => u.searchParams.get(k)).filter(Boolean).join(':');
        const key = `${u.origin}${u.pathname}${id ? `?${id}` : ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { role, company } = splitResultTitle(x.title, x.url);
        web.push({ title: role, company, url: x.url, snippet: x.snippet, age: x.age, ats: x.ats, inApp: Boolean(atsRef(x.url)), jobId: null });
      }
    }
    if (web.length) {
      // A posting saved from its ATS API is stored under the company's own link
      // (Greenhouse absolute_url), so match on the posting id as well as the URL.
      const postingId = (url: string) => {
        const ref = atsRef(url);
        return ref && 'id' in ref && ref.id.length >= 3 ? ref.id : null;
      };
      const ids = [...new Set(web.map((w) => postingId(w.url)).filter(Boolean))] as string[];
      const known = await prisma.job.findMany({
        where: { OR: [{ url: { in: web.map((w) => w.url) } }, ...ids.map((id) => ({ url: { contains: id } }))] },
        select: { id: true, url: true },
      });
      const byUrl = new Map(known.map((k) => [k.url, k.id]));
      const byPosting = (url: string) => {
        const id = postingId(url);
        return id ? known.find((k) => k.url.includes(id))?.id ?? null : null;
      };
      web = web.map((w) => ({ ...w, jobId: byUrl.get(w.url) ?? byPosting(w.url) }));
    }
    if (b.people) {
      const finder = peopleSearches(input).filter((p) => p.id === 'ta-leaders' || p.id === 'gcc-ta');
      const res = await Promise.allSettled(finder.map((p) => webSearch(cfg, p.query, 'w', 10)));
      const seenP = new Set<string>();
      for (const r of res) {
        if (r.status !== 'fulfilled') continue;
        for (const x of r.value) {
          if (!/linkedin\.com\/in\//.test(x.url) || seenP.has(x.url)) continue;
          seenP.add(x.url);
          people.push({ name: x.title.replace(/\s*\|\s*LinkedIn.*$/i, ''), url: x.url, snippet: x.snippet });
        }
      }
      people = people.slice(0, 20);
    }
  }
  return ok({ web, board, people, webEnabled: Boolean(cfg), provider: cfg?.provider ?? null, errors: [...new Set(errors)] });
});
