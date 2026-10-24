import pg from 'pg';
import { env } from '../src/config/env.js';

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined,
});

const plans = [
  {
    name: '1. Default newest-first listing',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, name, price, created_at
      FROM products
      ORDER BY created_at DESC, id DESC
      LIMIT 21`,
    values: [],
  },
  {
    name: '2. Combined brand/category/price filters',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, name, brand, category, price
      FROM products
      WHERE brand = $1 AND category = $2
        AND price >= $3 AND price <= $4
      ORDER BY created_at DESC, id DESC
      LIMIT 21`,
    values: ['NovaTech', 'Electronics', 10, 200],
  },
  {
    name: '3. Keyword search',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, name, description, brand, category, sku
      FROM products
      WHERE name ILIKE $1
         OR description ILIKE $1
         OR brand ILIKE $1
         OR category ILIKE $1
         OR sku ILIKE $1
      ORDER BY created_at DESC, id DESC
      LIMIT 21`,
    values: ['%Headphones%'],
  },
  {
    name: '4. Price ascending',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, name, price
      FROM products
      ORDER BY price ASC, id ASC
      LIMIT 21`,
    values: [],
  },
];

try {
  await client.connect();

  for (const plan of plans) {
    console.log(`\n=== ${plan.name} ===`);
    const result = await client.query<{ 'QUERY PLAN': string }>(
      plan.sql,
      plan.values,
    );
    console.log(result.rows.map((row) => row['QUERY PLAN']).join('\n'));
  }
} catch (error) {
  console.error(
    'Query-plan verification failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
