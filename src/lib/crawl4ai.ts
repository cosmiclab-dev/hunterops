// Optional page reader: a Crawl4AI server the person runs on their own VPS
// (github.com/unclecode/crawl4ai, Apache-2.0). It renders pages in a headless
// browser, so job sites that build their posting with JavaScript can be read.
// It runs with its defaults: no stealth mode, no proxy rotation, no bot-check
// workarounds. Pages that refuse automated readers (403, 429, human checks)
// stay unread.
import { assertPublicHost, fetchPublic, parsePublicUrl } from './net';
import { HttpError } from './http';
import { loadSettings, type Settings } from './settings';

export const CRAWL_TIMEOUT_MS = 30_000;

export type Crawler = { base: string; token: string | null };
export type CrawledPage = { url: string; status: number; html: string; markdown: string };

export function crawlerFrom(settings: Settings): Crawler | null {
  const raw = (settings.get('crawl4ai_url') || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  return { base: raw, token: settings.get('crawl4ai_token') };
}

export async function loadCrawler(): Promise<Crawler | null> {
  try {
    return crawlerFrom(await loadSettings());
  } catch {
    return null;
  }
}

// "user:password" is sent as Basic auth (a Coolify or Caddy password in front
// of the server); anything else is a Bearer token (Crawl4AI's own JWT).
export function authHeader(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: token.includes(':') ? `Basic ${Buffer.from(token).toString('base64')}` : `Bearer ${token}` };
}

function markdownOf(m: unknown): string {
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') {
    const o = m as Record<string, unknown>;
    return String(o.fit_markdown || o.raw_markdown || '');
  }
  return '';
}

export async function crawlPage(crawler: Crawler, target: string): Promise<CrawledPage> {
  // The crawler fetches for us, so the same public-only rule applies to the target.
  const u = parsePublicUrl(target);
  await assertPublicHost(u);
  const res = await fetchPublic(`${crawler.base}/crawl`, {
    method: 'POST',
    accept: 'application/json',
    timeoutMs: CRAWL_TIMEOUT_MS,
    headers: { 'content-type': 'application/json', ...authHeader(crawler.token) },
    body: JSON.stringify({
      urls: [u.toString()],
      browser_config: { type: 'BrowserConfig', params: { headless: true } },
      crawler_config: { type: 'CrawlerRunConfig', params: { stream: false, cache_mode: 'bypass', page_timeout: 25000 } },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'The page reader refused the token. Check it in Settings.');
  if (res.status >= 400) throw new HttpError(502, `The page reader answered HTTP ${res.status}.`);
  let data: any;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new HttpError(502, 'The page reader did not return JSON. Check its address in Settings.');
  }
  const r = Array.isArray(data?.results) ? data.results[0] : null;
  if (!r) throw new HttpError(502, 'The page reader returned no result.');
  if (r.success === false) throw new HttpError(502, `The page reader could not open the page${r.error_message ? `: ${String(r.error_message).slice(0, 200)}` : '.'}`);
  return {
    url: String(r.redirected_url || r.url || u.toString()),
    status: Number(r.status_code) || 200,
    html: String(r.html || r.cleaned_html || ''),
    markdown: markdownOf(r.markdown),
  };
}

// Quick check for Settings and the self-test.
export async function testCrawler(crawler: Crawler): Promise<string> {
  const started = Date.now();
  const page = await crawlPage(crawler, 'https://example.com/');
  if (!page.html && !page.markdown) throw new HttpError(502, 'The page reader answered but returned an empty page.');
  return `Read example.com in ${((Date.now() - started) / 1000).toFixed(1)}s.`;
}
