// One Neon HTTP client per function instance.
import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';

let cached;
export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new HttpError(503, 'DATABASE_URL is not set. Add it in Vercel > Project > Settings > Environment Variables.');
  }
  cached ??= neon(process.env.DATABASE_URL);
  return cached;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id, field = 'id') {
  if (!id || !UUID_RE.test(String(id))) throw new HttpError(400, `"${field}" must be a UUID.`);
  return String(id).toLowerCase();
}

export function isMissingTable(err) {
  return err?.code === '42P01' || /relation .* does not exist/i.test(err?.message || '');
}
