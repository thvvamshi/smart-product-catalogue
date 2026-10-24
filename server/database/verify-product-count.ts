import pg from 'pg';
import { env } from '../src/config/env.js';

const minimumProducts = 500;
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  const result = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products');
  const count = Number(result.rows[0]?.count ?? 0);
  if (!Number.isSafeInteger(count) || count < minimumProducts) {
    throw new Error(`Catalogue contains ${count} products; at least ${minimumProducts} are required.`);
  }
  console.log(`Verified catalogue product count: ${count}`);
} finally {
  await client.end();
}
