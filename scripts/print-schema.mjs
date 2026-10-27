// Prints every migration as one SQL script, for pasting into the Neon SQL Editor.
// Usage: npm run db:sql > schema.sql
import { MIGRATIONS } from '../netlify/lib/migrations.js';

for (const m of MIGRATIONS) process.stdout.write(`-- ${m.id}\n${m.sql.trim()}\n\n`);
process.stdout.write(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());\n`);
process.stdout.write(`INSERT INTO schema_migrations (id) VALUES ${MIGRATIONS.map((m) => `('${m.id}')`).join(', ')} ON CONFLICT DO NOTHING;\n`);
