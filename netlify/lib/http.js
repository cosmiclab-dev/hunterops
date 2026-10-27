// Shared helpers for HunterOps Netlify Functions (Functions API v2: Request in, Response out).
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export async function readJson(req, maxBytes = 64 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large.');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'Body must be a JSON object.');
  }
}

// Optional shared-secret gate. When APP_ACCESS_TOKEN is set, every request
// must carry it in the X-HunterOps-Key header.
export function requireAccess(req) {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return;
  const given = req.headers.get('x-hunterops-key') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Access key missing or wrong. Open Settings and enter your APP_ACCESS_TOKEN.');
  }
}

export function handleError(err, label) {
  if (err instanceof HttpError) {
    return json(err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  console.error(`[${label}]`, err);
  return json(500, { error: 'Unexpected server error. Check the function log in Netlify.' });
}

// Trimmed string field, or null when empty. Throws on wrong type or length.
export function str(value, field, { required = false, max = 2000 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `"${field}" is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `"${field}" must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new HttpError(400, `"${field}" is required.`);
    return null;
  }
  if (trimmed.length > max) throw new HttpError(400, `"${field}" is longer than ${max} characters.`);
  return trimmed;
}
