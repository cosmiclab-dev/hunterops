// Settings screen: integration keys (encrypted), model, feed preferences, Shortcut token.
import { HttpError, json } from '../http.js';
import { SETTINGS, publicSettings, saveSetting, saveInternal } from '../settings.js';
import { randomToken, sha256 } from '../crypto.js';
import { OPENCODE_GO_CHAT_MODELS } from '../models.js';

async function list() {
  return json(200, { settings: publicSettings(), models: OPENCODE_GO_CHAT_MODELS });
}

async function update(ctx) {
  const { values } = await ctx.body();
  if (!values || typeof values !== 'object') throw new HttpError(400, 'Send { "values": { key: value } }.');
  for (const [key, value] of Object.entries(values)) {
    if (!SETTINGS[key] || SETTINGS[key].internal) throw new HttpError(400, `Unknown setting "${key}".`);
    await saveSetting(ctx.sql, key, typeof value === 'string' ? value.trim() : value);
  }
  return json(200, { settings: publicSettings() });
}

// Creates a fresh token for iOS Shortcuts. Shown once; only its hash is stored.
async function shortcutToken(ctx) {
  const token = `ho_${randomToken(24)}`;
  await saveInternal(ctx.sql, 'shortcut_token_hash', sha256(token));
  return json(200, { token });
}

export default [
  ['GET', '/api/settings', list],
  ['PUT', '/api/settings', update],
  ['POST', '/api/settings/shortcut-token', shortcutToken],
];
