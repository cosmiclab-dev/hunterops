// Runs db/schema.sql against DATABASE_URL using the Neon HTTP driver.
// Usage: npm run db:migrate   (reads .env via node --env-file)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
const raw = await readFile(schemaPath, 'utf8');

// The HTTP driver runs one statement per request, so split the file.
// schema.sql has no function bodies or quoted semicolons, so a plain split is safe.
const statements = raw
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const sql = neon(url);
for (const statement of statements) {
  const firstLine = statement.split('\n')[0];
  process.stdout.write(`-> ${firstLine}\n`);
  await sql.query(statement);
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('users', 'saved_jobs', 'outreach_logs')
  ORDER BY table_name`;
console.log(`Done. Tables present: ${tables.map((t) => t.table_name).join(', ')}`);
