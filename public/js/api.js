// Thin client for the HunterOps API (/api/* -> Netlify Functions).
import { storage } from './dom.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, { opencodeKey } = {}) {
  const headers = { Accept: 'application/json' };
  const key = storage.get('access_key');
  if (key) headers['X-HunterOps-Key'] = key;
  // The user's own OpenCode Go key goes only to the AI function.
  const aiKey = opencodeKey ?? storage.get('opencode_key');
  if (path === '/api/ai' && aiKey) headers['X-OpenCode-Key'] = aiKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection.');
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const message = data?.error
      || (res.status === 404 ? 'API not found. Run with `netlify dev` locally, or check netlify.toml redirects.' : `Request failed (HTTP ${res.status}).`);
    const err = new ApiError(res.status, message);
    err.data = data;
    if (res.status === 401) window.dispatchEvent(new CustomEvent('hunterops:unauthorized'));
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('GET', '/api/health'),
  listJobs: () => request('GET', '/api/jobs'),
  createJob: (job) => request('POST', '/api/jobs', job),
  updateJob: (id, patch) => request('PATCH', `/api/jobs/${encodeURIComponent(id)}`, patch),
  deleteJob: (id) => request('DELETE', `/api/jobs/${encodeURIComponent(id)}`),
  listOutreach: () => request('GET', '/api/outreach'),
  logOutreach: (entry) => request('POST', '/api/outreach', entry),
  ai: (payload, opts) => request('POST', '/api/ai', payload, opts),
};
