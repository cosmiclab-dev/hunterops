// Applies pending migrations to DATABASE_URL using the Neon HTTP driver.
// Usage: npm run db:migrate   (reads .env via node --env-file)
// You can also click Settings > Database > Set up in the app.
import { neon } from '@neondatabase/serverless';
import { migrate } from '../netlify/lib/migrations.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
const result = await migrate(neon(process.env.DATABASE_URL), (msg) => console.log(`-> ${msg}`));
console.log(result.applied.length ? `Done. Applied: ${result.applied.join(', ')}` : `Already up to date (${result.latest}).`);
