import { HttpError, ok, readJson, route } from '@/lib/http';
import { PROVIDERS, isProviderId } from '@/lib/llm/providers';
import { SETTINGS, loadSettings, publicSettings, saveSetting } from '@/lib/settings';
import { hasAppSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await loadSettings();
  return ok({ settings: publicSettings(s), providers: PROVIDERS, appSecret: hasAppSecret() });
});

// { values: { key: "value" | null } }. null or "" clears a saved value.
export const PUT = route(async (req: Request) => {
  const { values } = await readJson<{ values?: Record<string, string | null> }>(req);
  if (!values || typeof values !== 'object') throw new HttpError(400, 'Send { "values": {...} }.');
  for (const [key, value] of Object.entries(values)) {
    if (!SETTINGS[key] || SETTINGS[key].internal) throw new HttpError(400, `Unknown setting "${key}".`);
    if (value !== null && typeof value !== 'string') throw new HttpError(400, `"${key}" must be text.`);
    if (!value) continue;
    if (key === 'llm_provider' && !isProviderId(value)) throw new HttpError(400, `Unknown AI provider "${value}".`);
    if (key === 'daily_email_cap' && !/^\d{1,3}$/.test(value.trim())) throw new HttpError(400, 'The daily email cap must be a whole number, like 20.');
    // Check before writing anything, so a save never half-applies.
    if (SETTINGS[key].secret && !hasAppSecret()) throw new HttpError(503, 'Keys cannot be saved yet: APP_SECRET is missing or shorter than 32 characters in Vercel.');
  }
  for (const [key, value] of Object.entries(values)) await saveSetting(key, value);
  return ok({ settings: publicSettings(await loadSettings()) });
});
