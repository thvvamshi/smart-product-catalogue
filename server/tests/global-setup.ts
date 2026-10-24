import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { fixtures } from './fixtures.js';

export default async function setup() {
  const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://catalogue_test:catalogue_test_local_only@localhost:5433/catalogue_test';
  const database = new URL(connectionString).pathname.slice(1);
  if (!/(^|_)test($|_)/i.test(database)) throw new Error(`Refusing destructive test setup for non-test database: ${database}`);
  process.env.DATABASE_URL = connectionString;
  process.env.NODE_ENV = 'test';
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(fileURLToPath(new URL('../database/schema.sql', import.meta.url)), 'utf8'));
    await client.query('TRUNCATE TABLE products RESTART IDENTITY');
    for (const item of fixtures) {
      await client.query(
        `INSERT INTO products (sku,name,description,brand,category,price,rating,in_stock,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...item],
      );
    }
  } finally { await client.end(); }
}
