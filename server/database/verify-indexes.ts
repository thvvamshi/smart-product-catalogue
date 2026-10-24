import pg from 'pg';
import { env } from '../src/config/env.js';

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined,
});

try {
  await client.connect();

  console.log('\n=== Database identity ===');
  const identity = await client.query(`
    SELECT current_database() AS database,
           current_schema() AS schema,
           current_setting('server_version') AS postgres_version
  `);
  console.table(identity.rows);

  console.log('\n=== Product data integrity ===');
  const integrity = await client.query(`
    SELECT
      COUNT(*) AS total_products,
      COUNT(DISTINCT sku) AS unique_skus,
      COUNT(*) FILTER (
        WHERE sku IS NULL OR name IS NULL OR brand IS NULL
          OR category IS NULL OR price IS NULL
          OR rating IS NULL OR created_at IS NULL
      ) AS rows_with_required_nulls,
      COUNT(*) FILTER (WHERE price < 0) AS invalid_prices,
      COUNT(*) FILTER (WHERE rating < 0 OR rating > 5) AS invalid_ratings
    FROM products
  `);
  console.table(integrity.rows);

  console.log('\n=== Installed extensions ===');
  const extensions = await client.query(`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname = 'pg_trgm'
  `);
  console.table(extensions.rows);
  if (extensions.rowCount === 0) {
    console.log('WARNING: pg_trgm is not installed in this database.');
  }

  console.log('\n=== Actual products indexes ===');
  const indexes = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'products'
    ORDER BY indexname
  `);
  console.table(indexes.rows);

  const required = [
    'products_pkey',
    'products_sku_key',
    'products_category_idx',
    'products_brand_idx',
    'products_price_idx',
    'products_price_id_idx',
    'products_rating_id_idx',
    'products_rating_keyset_idx',
    'products_created_id_idx',
    'products_name_id_idx',
    'products_name_trgm_idx',
    'products_description_trgm_idx',
    'products_brand_trgm_idx',
    'products_category_trgm_idx',
    'products_sku_trgm_idx',
  ];

  const found = new Set(indexes.rows.map((row) => row.indexname));
  console.log('\n=== Expected index checks ===');
  for (const name of required) {
    console.log(`${found.has(name) ? 'PASS' : 'MISSING'}: ${name}`);
  }

  console.log('\n=== Integrity summary ===');
  const row = integrity.rows[0]!;
  console.log(`Products: ${row.total_products}`);
  console.log(`Distinct SKUs: ${row.unique_skus}`);
  console.log(`Rows with required nulls: ${row.rows_with_required_nulls}`);
  console.log(`Invalid prices: ${row.invalid_prices}`);
  console.log(`Invalid ratings: ${row.invalid_ratings}`);
} catch (error) {
  console.error('Verification failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
