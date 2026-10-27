// Health and one-tap database setup.
import { json } from '../http.js';
import { getSql } from '../db.js';
import { migrate, pendingMigrations, MIGRATIONS } from '../migrations.js';
import { getSetting, settingSource } from '../settings.js';
import { hasAppSecret } from '../crypto.js';
import { passwordRequired } from '../auth.js';

async function health() {
  const out = {
    database: { configured: Boolean(process.env.DATABASE_URL), reachable: false, pending: [] },
    ai: { configured: Boolean(getSetting('opencode_api_key')), model: getSetting('opencode_model') },
    integrations: {
      adzuna: Boolean(getSetting('adzuna_app_id') && getSetting('adzuna_app_key')),
      hunter: Boolean(getSetting('hunter_api_key')),
      gmail: Boolean(getSetting('smtp_user') && getSetting('smtp_app_password')),
    },
    security: { password: passwordRequired(), app_secret: hasAppSecret(), cron_secret: Boolean(process.env.CRON_SECRET) },
  };
  if (out.database.configured) {
    try {
      const pending = await pendingMigrations(getSql());
      out.database.reachable = true;
      out.database.pending = pending.map((m) => m.id);
      out.database.latest = MIGRATIONS.at(-1).id;
    } catch (err) {
      console.error('[health]', err);
      out.database.error = 'Could not reach Neon with DATABASE_URL.';
    }
  }
  out.ai.key_source = settingSource('opencode_api_key');
  return json(200, out);
}

async function runMigrations() {
  const result = await migrate(getSql());
  return json(200, result);
}

export default [
  ['GET', '/api/health', health],
  ['POST', '/api/admin/migrate', runMigrations, { noDb: true }],
];
