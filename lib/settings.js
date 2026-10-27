// App settings stored in Neon. Secrets are encrypted with APP_SECRET; each
// setting can also come from an environment variable, which acts as a fallback.
import { HttpError } from './http.js';
import { encrypt, decrypt } from './crypto.js';
import { isMissingTable } from './db.js';

export const SETTINGS = {
  opencode_api_key: { secret: true, env: 'OPENCODE_API_KEY', label: 'OpenCode Go API key' },
  opencode_model: { env: 'OPENCODE_MODEL', label: 'Model', fallback: 'deepseek-v4.1-flash' },
  adzuna_app_id: { env: 'ADZUNA_APP_ID', label: 'Adzuna app ID' },
  adzuna_app_key: { secret: true, env: 'ADZUNA_APP_KEY', label: 'Adzuna app key' },
  hunter_api_key: { secret: true, env: 'HUNTER_API_KEY', label: 'Hunter.io API key' },
  smtp_user: { env: 'GMAIL_USER', label: 'Gmail address' },
  smtp_app_password: { secret: true, env: 'GMAIL_APP_PASSWORD', label: 'Gmail app password' },
  sender_name: { env: 'SENDER_NAME', label: 'Your name on emails' },
  daily_email_cap: { env: 'DAILY_EMAIL_CAP', label: 'Max emails per day', fallback: '20' },
  feed_keywords: {
    label: 'Role keywords',
    fallback: 'recruiter, talent acquisition, talent partner, sourcer, talent sourcing, recruitment, hiring partner, ta partner, ta specialist, ta lead, head of talent',
  },
  feed_exclude: { label: 'Exclude words', fallback: 'intern, internship, trainee, apprentice' },
  feed_locations: { label: 'Locations', fallback: 'bengaluru,remote_india,remote_global' },
  shortcut_token_hash: { internal: true },
  boards_scanned_at: { internal: true },
};

const cache = new Map();

export async function loadSettings(sql) {
  let rows = [];
  try {
    rows = await sql`SELECT key, value, is_secret FROM app_settings`;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  cache.clear();
  for (const r of rows) {
    try {
      cache.set(r.key, r.is_secret ? decrypt(r.value) : r.value);
    } catch {
      cache.set(r.key, null); // APP_SECRET changed: treat as unset.
    }
  }
  return cache;
}

// The app's saved value, else the env var, else the default.
export function getSetting(key) {
  const def = SETTINGS[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  const v = cache.get(key);
  if (v) return v;
  if (def.env && process.env[def.env]) return process.env[def.env];
  return def.fallback ?? null;
}

export function settingSource(key) {
  const def = SETTINGS[key];
  if (cache.get(key)) return 'app';
  if (def.env && process.env[def.env]) return 'env';
  return def.fallback ? 'default' : null;
}

export async function saveSetting(sql, key, value) {
  const def = SETTINGS[key];
  if (!def || def.internal) throw new HttpError(400, `Unknown setting "${key}".`);
  if (value === null || value === '') {
    await sql`DELETE FROM app_settings WHERE key = ${key}`;
    cache.delete(key);
    return;
  }
  if (typeof value !== 'string' || value.length > 4000) throw new HttpError(400, `"${key}" must be text under 4000 characters.`);
  const stored = def.secret ? encrypt(value) : value;
  await sql`
    INSERT INTO app_settings (key, value, is_secret, updated_at)
    VALUES (${key}, ${stored}, ${Boolean(def.secret)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_at = now()`;
  cache.set(key, value);
}

export async function saveInternal(sql, key, value) {
  await sql`
    INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES (${key}, ${value}, false, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  cache.set(key, value);
}

const mask = (v) => (!v ? null : v.length <= 8 ? '••••' : `${v.slice(0, 3)}••••${v.slice(-4)}`);

// What the Settings screen sees: never the secret values themselves.
export function publicSettings() {
  const out = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    if (def.internal) continue;
    const source = settingSource(key);
    out[key] = {
      label: def.label,
      secret: Boolean(def.secret),
      source,
      value: def.secret ? null : getSetting(key),
      hint: def.secret && source ? mask(getSetting(key)) : null,
    };
  }
  return out;
}

export const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
