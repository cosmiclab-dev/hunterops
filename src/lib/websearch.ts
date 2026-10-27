// Web search for X-Ray results inside HunterOps instead of on google.com.
// Free, no key (the default): Bing's public RSS results, then DuckDuckGo Lite.
// Both are plain public pages; if one answers with a human check, it is skipped
// and reported, never worked around.
// Optional keyed APIs for steadier results: serper (Google) and brave.
import { HttpError } from './http';
import type { Settings } from './settings';
import type { WindowKey } from './xray';

export type SearchProvider = 'free' | 'serper' | 'brave';
export type WebResult = { title: string; url: string; snippet: string; age: string | null };

export const SEARCH_PROVIDERS: Record<SearchProvider, { label: string; signup: string }> = {
  free: { label: 'Free: Bing + DuckDuckGo (no key)', signup: '' },
  serper: { label: 'Serper (Google results)', signup: 'https://serper.dev' },
  brave: { label: 'Brave Search API', signup: 'https://api-dashboard.search.brave.com' },
};

// A keyed provider when one is set up; otherwise the free sources. Never null.
export function searchConfig(s: Settings): { provider: SearchProvider; key: string } {
  const provider = s.get('search_provider') as SearchProvider | null;
  const key = s.get('search_api_key');
  if (key && (provider === 'serper' || provider === 'brave')) return { provider, key };
  return { provider: 'free', key: '' };
}

// Test hook so e2e can point both providers at a local mock.
const base = (url: string) => (process.env.SEARCH_API_BASE ? url.replace(/^https:\/\/[^/]+/, process.env.SEARCH_API_BASE) : url);

const SERPER_TBS: Record<WindowKey, string> = { d: 'qdr:d', d2: 'qdr:h48', w: 'qdr:w' };

function braveFreshness(w: WindowKey, now = new Date()) {
  if (w === 'd') return 'pd';
  if (w === 'w') return 'pw';
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return `${day(new Date(now.getTime() - 2 * 864e5))}to${day(now)}`;
}

async function call(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'The web search API rejected the key. Check it in Settings.');
    if (res.status === 429) throw new HttpError(429, 'The web search API limit is used up for now. Try again later.');
    if (!res.ok) throw new HttpError(502, `The web search API answered HTTP ${res.status}.`);
    return JSON.parse(text);
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    if (err?.name === 'AbortError') throw new HttpError(504, 'The web search took too long.');
    throw new HttpError(502, 'Could not reach the web search API.');
  } finally {
    clearTimeout(timer);
  }
}

const UA = 'Mozilla/5.0 (compatible; HunterOps/2.0; personal job search)';
const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/<[^>]+>/g, '').trim();

async function getText(url: string, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-IN,en;q=0.9' }, signal: controller.signal });
    if (res.status === 429) throw new HttpError(429, `${label} is rate-limiting searches right now. Try again in a few minutes.`);
    if (!res.ok) throw new HttpError(502, `${label} answered HTTP ${res.status}.`);
    return await res.text();
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    if (err?.name === 'AbortError') throw new HttpError(504, `${label} took too long.`);
    throw new HttpError(502, `Could not reach ${label}.`);
  } finally {
    clearTimeout(timer);
  }
}

// Bing's "filters" freshness: past 24h, a custom day range, or past week.
export function bingFreshness(w: WindowKey, now = Date.now()) {
  if (w === 'd') return 'ex1:"ez1"';
  if (w === 'w') return 'ex1:"ez2"';
  const today = Math.floor(now / 864e5);
  return `ex1:"ez5_${today - 2}_${today}"`;
}

export function parseBingRss(xml: string): WebResult[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const tag = (t: string) => decode(m[1].match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`))?.[1] || '');
    return { title: tag('title'), url: tag('link'), snippet: tag('description'), age: tag('pubDate') || null };
  }).filter((r) => /^https?:\/\//.test(r.url));
}

export function parseDuckLite(html: string): WebResult[] {
  if (/anomaly|unusual traffic|select all (the )?squares/i.test(html) && !/result-link/.test(html)) {
    throw new HttpError(503, 'DuckDuckGo asked for a human check, so it was skipped.');
  }
  const out: WebResult[] = [];
  const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>|<a[^>]+class=['"]result-link['"][^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
  links.forEach((m, i) => {
    let url = decode(m[1] || m[3] || '');
    const wrapped = url.match(/[?&]uddg=([^&]+)/);
    if (wrapped) url = decodeURIComponent(wrapped[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    if (/^https?:\/\//.test(url) && !/duckduckgo\.com/.test(url)) out.push({ title: decode(m[2] || m[4] || ''), url, snippet: snippets[i] || '', age: null });
  });
  return out;
}

const DDG_DF: Record<WindowKey, string> = { d: 'd', d2: 'w', w: 'w' };

export async function bingSearch(q: string, window: WindowKey, num = 20): Promise<WebResult[]> {
  const p = new URLSearchParams({ q, format: 'rss', count: String(Math.min(num, 30)), filters: bingFreshness(window), setlang: 'en-IN', cc: 'IN' });
  return parseBingRss(await getText(base(`https://www.bing.com/search?${p}`), 'Bing'));
}

export async function duckSearch(q: string, window: WindowKey): Promise<WebResult[]> {
  const p = new URLSearchParams({ q, df: DDG_DF[window], kl: 'in-en' });
  return parseDuckLite(await getText(base(`https://lite.duckduckgo.com/lite/?${p}`), 'DuckDuckGo'));
}

// Free search: Bing RSS first; DuckDuckGo Lite fills in when Bing is thin or down.
async function freeSearch(q: string, window: WindowKey, num: number): Promise<WebResult[]> {
  const errors: string[] = [];
  let results: WebResult[] = [];
  try {
    results = await bingSearch(q, window, num);
  } catch (err) {
    errors.push((err as Error).message);
  }
  if (results.length < 3) {
    try {
      const seen = new Set(results.map((r) => r.url));
      results = [...results, ...(await duckSearch(q, window)).filter((r) => !seen.has(r.url))];
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  if (!results.length && errors.length) throw new HttpError(502, `Free web search returned nothing: ${errors.join(' ')}`);
  return results.slice(0, num);
}

export async function webSearch(cfg: { provider: SearchProvider; key: string }, q: string, window: WindowKey, num = 20): Promise<WebResult[]> {
  if (cfg.provider === 'free') return freeSearch(q, window, num);
  if (cfg.provider === 'serper') {
    const data = await call(base('https://google.serper.dev/search'), {
      method: 'POST',
      headers: { 'X-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num, tbs: SERPER_TBS[window], gl: 'in' }),
    });
    return (data.organic || []).map((r: any) => ({ title: String(r.title || ''), url: String(r.link || ''), snippet: String(r.snippet || ''), age: r.date || null }))
      .filter((r: WebResult) => /^https?:\/\//.test(r.url));
  }
  const p = new URLSearchParams({ q, count: String(Math.min(num, 20)), freshness: braveFreshness(window), country: 'in' });
  const data = await call(base(`https://api.search.brave.com/res/v1/web/search?${p}`), {
    headers: { 'X-Subscription-Token': cfg.key, Accept: 'application/json' },
  });
  return (data.web?.results || []).map((r: any) => ({ title: String(r.title || ''), url: String(r.url || ''), snippet: String(r.description || '').replace(/<[^>]+>/g, ''), age: r.age || r.page_age || null }))
    .filter((r: WebResult) => /^https?:\/\//.test(r.url));
}

// "Senior Recruiter, GTM & Sales - Human Interest" style titles: role and company.
export function splitResultTitle(title: string, url: string): { role: string; company: string } {
  const t = title.replace(/^job application for\s+/i, '').replace(/\s*[|–-]\s*(greenhouse|lever|ashby|workday|smartrecruiters|careers?).*$/i, '').trim();
  const at = t.match(/^(.*?)\s+at\s+(.+)$/i);
  if (at) return { role: at[1].trim(), company: at[2].trim() };
  const dash = t.split(/\s+[-–|]\s+/);
  if (dash.length >= 2) return { role: dash[0].trim(), company: dash[dash.length - 1].trim() };
  let company = '';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    company = /greenhouse|lever|ashby/.test(u.hostname) ? parts[0] || '' : u.hostname.split('.')[0];
  } catch { /* keep empty */ }
  return { role: t, company: company.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
}
