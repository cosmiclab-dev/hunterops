// Shared HTTP helpers for HunterOps API routes (Web Request in, Response out).

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

export function handleError(err, label) {
  if (err instanceof HttpError) {
    return json(err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err?.code === '42P01' || /relation .* does not exist/i.test(err?.message || '')) {
    return json(503, { error: 'Database tables are missing. Open Settings and tap "Set up database".', code: 'schema_missing' });
  }
  console.error(`[${label}]`, err);
  return json(500, { error: 'Unexpected server error. Check the function logs in Vercel.' });
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
