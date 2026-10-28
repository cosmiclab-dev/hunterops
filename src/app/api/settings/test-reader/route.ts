import { ok, readJson, route, HttpError } from '@/lib/http';
import { crawlerFrom, testCrawler } from '@/lib/crawl4ai';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reads example.com through the page reader, with the saved settings or with
// unsaved values from the form.
export const POST = route(async (req: Request) => {
  const o = await readJson<{ url?: string; token?: string }>(req);
  const saved = crawlerFrom(await loadSettings());
  const base = (o.url || '').trim().replace(/\/+$/, '') || saved?.base;
  if (!base) throw new HttpError(400, 'Add the page reader address first.');
  // The saved token only goes to the saved address.
  if (base !== saved?.base && !o.token && saved?.token) throw new HttpError(400, 'Type the password or token to test a new address.');
  const detail = await testCrawler({ base, token: o.token || (base === saved?.base ? saved?.token : null) || null });
  return ok({ ok: true, detail });
});
