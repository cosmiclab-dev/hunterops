// Web search through an official search API, so X-Ray results show inside
// HunterOps instead of on google.com. Two providers, both with free tiers:
//   serper  google.serper.dev (Google results; 2,500 free searches)
//   brave   api.search.brave.com (Brave's own index)
// The person adds one key in Settings. Nothing scrapes a search page.
import { HttpError } from './http';
import type { Settings } from './settings';
import type { WindowKey } from './xray';

export type SearchProvider = 'serper' | 'brave';
export type WebResult = { title: string; url: string; snippet: string; age: string | null };

export const SEARCH_PROVIDERS: Record<SearchProvider, { label: string; signup: string }> = {
  serper: { label: 'Serper (Google results)', signup: 'https://serper.dev' },
  brave: { label: 'Brave Search API', signup: 'https://api-dashboard.search.brave.com' },
};

export function searchConfig(s: Settings): { provider: SearchProvider; key: string } | null {
  const provider = s.get('search_provider') as SearchProvider | null;
  const key = s.get('search_api_key');
  if (!key || !provider || !(provider in SEARCH_PROVIDERS)) return null;
  return { provider, key };
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

export async function webSearch(cfg: { provider: SearchProvider; key: string }, q: string, window: WindowKey, num = 20): Promise<WebResult[]> {
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
