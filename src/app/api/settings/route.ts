import { HttpError, ok, readJson, route } from '@/lib/http';
import { PROVIDERS } from '@/lib/llm/providers';
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
  }
  for (const [key, value] of Object.entries(values)) await saveSetting(key, value);
  return ok({ settings: publicSettings(await loadSettings()) });
});
