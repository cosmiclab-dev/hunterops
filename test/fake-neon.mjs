// Test double for @neondatabase/serverless: same call shapes (tagged template,
// sql.query, sql.transaction), backed by a real local Postgres via `pg`.
import pg from 'pg';

let pool;
export function getPool() {
  pool ??= new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  return pool;
}

function toQuery(strings, values) {
  let text = strings[0];
  values.forEach((_, i) => { text += `$${i + 1}${strings[i + 1]}`; });
  return { text, values };
}

export function neon() {
  const run = async (client, { text, values }) => (await client.query(text, values)).rows;
  const sql = (strings, ...values) => {
    const q = toQuery(strings, values);
    return {
      __query: q,
      then: (res, rej) => run(getPool(), q).then(res, rej),
    };
  };
  sql.query = (text, values = []) => run(getPool(), { text, values });
  sql.transaction = async (queries) => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const q of queries) out.push(await run(client, q.__query));
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  return sql;
}
