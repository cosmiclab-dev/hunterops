// Tiny router for the single Vercel function in api/index.js.
// Each route: [METHOD, '/api/path/:param', handler, options].
import { HttpError, json, readJson, handleError } from './http.js';
import { getSql } from './db.js';
import { loadSettings } from './settings.js';
import { requireAuth } from './auth.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import jobRoutes from './routes/jobs.js';
import feedRoutes from './routes/feed.js';
import aiRoutes from './routes/ai.js';
import profileRoutes from './routes/profile.js';
import resumeRoutes from './routes/resumes.js';
import peopleRoutes from './routes/people.js';
import shortcutRoutes from './routes/shortcut.js';

const ROUTES = [
  ...authRoutes, ...adminRoutes, ...settingsRoutes, ...jobRoutes, ...feedRoutes,
  ...aiRoutes, ...profileRoutes, ...resumeRoutes, ...peopleRoutes, ...shortcutRoutes,
].map(([method, pattern, handler, opts = {}]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  return { method, re, keys, handler, opts };
});

// Vercel rewrites /api/* to /api?__path=*; locally the path arrives as is.
export function apiPath(url) {
  const forwarded = url.searchParams.get('__path');
  if (forwarded !== null) return `/api/${forwarded}`.replace(/\/+$/, '');
  return url.pathname.replace(/\/+$/, '');
}

export async function handle(req) {
  const url = new URL(req.url);
  const path = apiPath(url);
  const method = req.method.toUpperCase();
  try {
    const candidates = ROUTES.filter((r) => r.re.test(path));
    if (!candidates.length) throw new HttpError(404, `No API route for ${path}.`);
    const route = candidates.find((r) => r.method === method);
    if (!route) throw new HttpError(405, `${method} is not supported on ${path}.`);

    const match = path.match(route.re);
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    const ctx = {
      req, url, params, method,
      get sql() { return getSql(); },
      body: (max) => readJson(req, max),
    };
    if (!route.opts.noDb) await loadSettings(getSql());
    if (!route.opts.public) ctx.auth = requireAuth(req, { allowToken: route.opts.token });
    return await route.handler(ctx);
  } catch (err) {
    return handleError(err, `${method} ${path}`);
  }
}

export { json };
