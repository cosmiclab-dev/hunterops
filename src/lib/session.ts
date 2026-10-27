// Single-owner login: APP_PASSWORD -> signed session cookie. Uses Web Crypto so
// the same code runs in middleware (edge) and route handlers (node).
export const SESSION_COOKIE = 'ho_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

async function hmac(value: string) {
  const secret = process.env.APP_SECRET || process.env.APP_PASSWORD || '';
  const key = await crypto.subtle.importKey('raw', enc.encode(`session:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const passwordRequired = () => Boolean(process.env.APP_PASSWORD);

export async function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${exp}.${await hmac(`ho:${exp}`)}`;
}

export async function verifySession(raw: string | undefined | null) {
  if (!raw) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac || Number(exp) * 1000 < Date.now()) return false;
  const expected = await hmac(`ho:${exp}`);
  if (expected.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
