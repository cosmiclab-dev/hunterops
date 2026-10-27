// Single-owner login: APP_PASSWORD -> signed HttpOnly session cookie.
// iOS Shortcuts use a separate bearer token generated in Settings.
import { HttpError } from './http.js';
import { sign, safeEqual, sha256 } from './crypto.js';
import { getSetting } from './settings.js';

const COOKIE = 'ho_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const passwordRequired = () => Boolean(process.env.APP_PASSWORD);

function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${COOKIE}=${exp}.${sign(`session:${exp}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function hasSession(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac || Number(exp) * 1000 < Date.now()) return false;
  return safeEqual(mac, sign(`session:${exp}`));
}

export function checkPassword(given) {
  return passwordRequired() && typeof given === 'string' && safeEqual(given, process.env.APP_PASSWORD);
}

export function hasBearerToken(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const stored = getSetting('shortcut_token_hash');
  return Boolean(stored) && safeEqual(sha256(auth.slice(7).trim()), stored);
}

// Call after loadSettings(). Without APP_PASSWORD the app is open (local dev).
export function requireAuth(req, { allowToken = false } = {}) {
  if (!passwordRequired()) return 'open';
  if (hasSession(req)) return 'session';
  if (allowToken && hasBearerToken(req)) return 'token';
  throw new HttpError(401, 'Please sign in.');
}
