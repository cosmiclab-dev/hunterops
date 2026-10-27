// Applies db/migrations/*.sql in order and records them in schema_migrations.
// Used by scripts/migrate.mjs (CLI) and the /api/admin/migrate endpoint (Settings).
import m001 from './migrations/001_init.js';
import m002 from './migrations/002_v2.js';

export const MIGRATIONS = [
  { id: '001_init', sql: m001 },
  { id: '002_v2', sql: m002 },
];

// The HTTP driver runs one statement per request. Our migrations contain no
// function bodies or quoted semicolons, so splitting on ";" is safe.
export function splitStatements(raw) {
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function pendingMigrations(sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const rows = await sql`SELECT id FROM schema_migrations`;
  const done = new Set(rows.map((r) => r.id));
  return MIGRATIONS.filter((m) => !done.has(m.id));
}

export async function migrate(sql, log = () => {}) {
  const pending = await pendingMigrations(sql);
  for (const m of pending) {
    log(`Applying ${m.id}`);
    for (const statement of splitStatements(m.sql)) await sql.query(statement);
    await sql`INSERT INTO schema_migrations (id) VALUES (${m.id}) ON CONFLICT DO NOTHING`;
  }
  return { applied: pending.map((m) => m.id), latest: MIGRATIONS.at(-1).id };
}
