// App settings stored in Neon. Secrets are encrypted with APP_SECRET; each
// setting can also come from an environment variable, which acts as a fallback.
import { prisma } from './db';
import { encrypt, decrypt } from './crypto';
import { HttpError } from './http';
import { PROVIDERS, type ProviderId } from './llm/providers';

type Def = { label: string; secret?: boolean; env?: string; fallback?: string; internal?: boolean };

const providerKeys = Object.fromEntries(
  (Object.keys(PROVIDERS) as ProviderId[]).map((id) => [
    `llm_key_${id}`,
    { label: `${PROVIDERS[id].label} API key`, secret: true, env: PROVIDERS[id].envKey },
  ]),
) as Record<string, Def>;

export const SETTINGS: Record<string, Def> = {
  llm_provider: { label: 'AI provider', env: 'LLM_PROVIDER', fallback: 'opencode' },
  llm_model: { label: 'Model', env: 'LLM_MODEL' },
  llm_base_url: { label: 'Base URL (custom provider)', env: 'LLM_BASE_URL' },
  ...providerKeys,
  smtp_user: { label: 'Gmail address', env: 'GMAIL_USER' },
  smtp_app_password: { label: 'Gmail app password', secret: true, env: 'GMAIL_APP_PASSWORD' },
  sender_name: { label: 'Your name on emails', env: 'SENDER_NAME' },
  daily_email_cap: { label: 'Max emails per day', env: 'DAILY_EMAIL_CAP', fallback: '20' },
  adzuna_app_id: { label: 'Adzuna app ID', env: 'ADZUNA_APP_ID' },
  adzuna_app_key: { label: 'Adzuna app key', secret: true, env: 'ADZUNA_APP_KEY' },
  feed_keywords: {
    label: 'Role keywords',
    fallback: 'recruiter, talent acquisition, talent partner, sourcer, talent sourcing, recruitment, hiring partner, ta partner, ta specialist, ta lead, head of talent',
  },
  feed_exclude: { label: 'Exclude words', fallback: 'intern, internship, trainee, apprentice' },
  feed_locations: { label: 'Locations', fallback: 'bengaluru,remote_india,remote_global' },
  auto_apply_count: { label: 'Applications the AI prepares each morning', fallback: '3' },
  auto_apply_min_score: { label: 'Lowest Grill Score it prepares for', fallback: '75' },
  banned_words_extra: { label: 'Extra banned words' },
  writing_tone: { label: 'Writing tone', fallback: 'warm' },
  email_length: { label: 'Email length', fallback: 'standard' },
  email_signature: { label: 'Email signature' },
  search_provider: { label: 'Web search', fallback: 'free' },
  search_api_key: { label: 'Web search API key', secret: true, env: 'SEARCH_API_KEY' },
  crawl4ai_url: { label: 'Page reader address (Crawl4AI)', env: 'CRAWL4AI_URL' },
  crawl4ai_token: { label: 'Page reader token', secret: true, env: 'CRAWL4AI_TOKEN' },
  boards_scanned_at: { label: 'Boards last scanned', internal: true },
  seed_version: { label: 'Starter boards version', internal: true },
  login_lock: { label: 'Wrong passwords in a row', internal: true },
  vapid_public: { label: 'Notification key (public)', internal: true },
  vapid_private: { label: 'Notification key (private)', internal: true, secret: true },
  ai_health: { label: 'Last real AI check', internal: true },
};

export type SettingKey = keyof typeof SETTINGS;
export type Settings = { get: (key: string) => string | null; source: (key: string) => 'app' | 'env' | 'default' | null };

// Loads every setting once per request and resolves app value > env > default.
export async function loadSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const values = new Map<string, string | null>();
  for (const r of rows) {
    try {
      values.set(r.key, r.isSecret ? decrypt(r.value) : r.value);
    } catch {
      values.set(r.key, null); // APP_SECRET changed: treat as unset.
    }
  }
  const def = (key: string) => {
    const d = SETTINGS[key];
    if (!d) throw new Error(`Unknown setting ${key}`);
    return d;
  };
  return {
    get(key) {
      const d = def(key);
      const v = values.get(key);
      if (v) return v;
      if (d.env && process.env[d.env]) return process.env[d.env] as string;
      return d.fallback ?? null;
    },
    source(key) {
      const d = def(key);
      if (values.get(key)) return 'app';
      if (d.env && process.env[d.env]) return 'env';
      return d.fallback ? 'default' : null;
    },
  };
}

export async function saveSetting(key: string, value: string | null) {
  const d = SETTINGS[key];
  if (!d || d.internal) throw new HttpError(400, `Unknown setting "${key}".`);
  if (value === null || value === '') {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  if (value.length > 4000) throw new HttpError(400, `"${key}" must be under 4000 characters.`);
  const stored = d.secret ? encrypt(value) : value;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, isSecret: Boolean(d.secret) },
    update: { value: stored, isSecret: Boolean(d.secret) },
  });
}

export async function saveInternal(key: string, value: string) {
  const secret = Boolean(SETTINGS[key]?.secret);
  const stored = secret ? encrypt(value) : value;
  await prisma.setting.upsert({ where: { key }, create: { key, value: stored, isSecret: secret }, update: { value: stored, isSecret: secret } });
}

const mask = (v: string) => (v.length <= 8 ? '••••' : `${v.slice(0, 3)}••••${v.slice(-4)}`);

// What the Settings screen sees: never the secret values themselves.
export function publicSettings(s: Settings) {
  const out: Record<string, { label: string; secret: boolean; source: string | null; value: string | null; hint: string | null }> = {};
  for (const [key, d] of Object.entries(SETTINGS)) {
    if (d.internal) continue;
    const source = s.source(key);
    const v = s.get(key);
    out[key] = {
      label: d.label,
      secret: Boolean(d.secret),
      source,
      value: d.secret ? null : v,
      hint: d.secret && v ? mask(v) : null,
    };
  }
  return out;
}
