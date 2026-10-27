// Server-side fetch of a page the person asked to open (the in-app Browser,
// "Grill a URL", job import). Public http(s) only: private and loopback
// addresses are refused so the app can't be used to reach internal services.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './http';

export const PAGE_TIMEOUT_MS = 12_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const UA = 'Mozilla/5.0 (compatible; HunterOps/2.0; personal job search)';

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const allowPrivate = () => process.env.ALLOW_PRIVATE_FETCH === '1';

export function parsePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new HttpError(400, 'That is not a valid link. Paste the full address starting with https://');
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http and https links can be opened.');
  if (u.username || u.password) throw new HttpError(400, 'Links with a username or password are not allowed.');
  return u;
}

async function assertPublicHost(u: URL) {
  if (allowPrivate()) return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new HttpError(400, 'That address is not on the public internet.');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new HttpError(502, `Could not find ${host}. Check the link.`);
  if (ips.some(isPrivateIp)) throw new HttpError(400, 'That address is not on the public internet.');
}

export type FetchedPage = { url: string; status: number; contentType: string; body: string; headers: Headers };

// GET with redirects followed by hand, so every hop is checked.
export async function fetchPublic(raw: string, init: { accept?: string; method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<FetchedPage> {
  let u = parsePublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(u);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u, {
        method: init.method || 'GET',
        body: init.body,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: init.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-IN,en;q=0.9', ...init.headers },
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') throw new HttpError(504, 'The page took too long to load.');
      throw new HttpError(502, `Could not load ${u.hostname}.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      u = parsePublicUrl(new URL(res.headers.get('location') as string, u).toString());
      continue;
    }
    try {
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      return { url: u.toString(), status: res.status, contentType: res.headers.get('content-type') || '', body, headers: res.headers };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new HttpError(504, 'The page took too long to load.');
      throw new HttpError(502, `Could not read ${u.hostname}.`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new HttpError(502, 'Too many redirects.');
}

export async function fetchPublicJson(raw: string, init: Parameters<typeof fetchPublic>[1] = {}) {
  const page = await fetchPublic(raw, { accept: 'application/json', ...init });
  if (page.status === 404) throw new HttpError(404, 'That posting was not found. It may have closed.');
  if (page.status >= 400) throw new HttpError(502, `The job site answered HTTP ${page.status}.`);
  try {
    return JSON.parse(page.body);
  } catch {
    throw new HttpError(502, 'The job site did not return JSON.');
  }
}

// Whether a site lets other apps show it in a frame (X-Frame-Options / CSP frame-ancestors).
export function frameAllowed(headers: Headers): boolean {
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;
  const csp = headers.get('content-security-policy') || '';
  const fa = csp.split(';').map((d) => d.trim()).find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (!fa) return true;
  const sources = fa.split(/\s+/).slice(1);
  return sources.includes('*') || sources.some((s) => /^https:\/\/\*?$/.test(s));
}
