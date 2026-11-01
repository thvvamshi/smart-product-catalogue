import pg from 'pg';
import { env } from '../src/config/env.js';

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
try {
  await client.connect();
  const result = await client.query<{
    total_stores: string; active_stores: string; demo_stores: string; inventory_records: string;
    available_inventory: string; stores_without_inventory: string; represented_products: string;
  }>(`SELECT
      (SELECT COUNT(*) FROM stores)::text AS total_stores,
      (SELECT COUNT(*) FROM stores WHERE is_active)::text AS active_stores,
      (SELECT COUNT(*) FROM stores WHERE is_demo)::text AS demo_stores,
      (SELECT COUNT(*) FROM store_inventory)::text AS inventory_records,
      (SELECT COUNT(*) FROM store_inventory WHERE is_available AND stock_quantity > 0)::text AS available_inventory,
      (SELECT COUNT(*) FROM stores s WHERE NOT EXISTS (SELECT 1 FROM store_inventory i WHERE i.store_id=s.id))::text AS stores_without_inventory,
      (SELECT COUNT(DISTINCT product_id) FROM store_inventory)::text AS represented_products`);
  console.log(JSON.stringify(result.rows[0], null, 2));
} finally {
  await client.end();
}
