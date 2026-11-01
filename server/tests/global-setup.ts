import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { fixtures } from './fixtures.js';
import { applyMigrations } from '../database/migration-runner.js';
import { demoStores } from '../database/hyperlocal-data.js';

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
    await applyMigrations(client);
    await client.query('TRUNCATE TABLE delivery_task_locations, eta_snapshots, delivery_status_history, delivery_assignments, delivery_tasks, delivery_agents, delivery_dispatchers, order_inventory_adjustments, order_items, store_order_status_history, order_status_history, store_orders, customer_orders, store_operators, inventory_reservation_items, inventory_reservations, checkout_attempts, cart_items, carts, customer_addresses, store_inventory, product_variants, categories, stores, products RESTART IDENTITY');
    for (const item of fixtures) {
      await client.query(
        `INSERT INTO products (sku,name,description,brand,category,price,rating,in_stock,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...item],
      );
    }
    await client.query(`INSERT INTO product_variants (product_id,sku,attributes)
      SELECT id,sku,'{}'::jsonb FROM products`);
    for (const store of demoStores) {
      await client.query(
        `INSERT INTO stores (store_code,name,description,address_line,landmark,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes,is_active,is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE)`,
        [store.storeCode, store.name, store.description, store.addressLine, store.landmark, store.area, store.city, store.state, store.postalCode, store.latitude, store.longitude, store.deliveryRadiusKm, store.preparationTimeMinutes],
      );
    }
    await client.query(
      `INSERT INTO stores (store_code,name,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes,is_active,is_demo)
       VALUES ('HYD-INACTIVE','Inactive Demo Store','Gachibowli','Hyderabad','Telangana','500032',17.4401,78.3489,50,5,FALSE,TRUE)`,
    );
    await client.query(
      `INSERT INTO store_inventory (store_id,product_id,variant_id,stock_quantity,selling_price,is_available)
       SELECT s.id, p.id, v.id, MOD(p.id * s.id, 7)::integer, ROUND((p.price * 0.99)::numeric,2), MOD(p.id + s.id,4) <> 0
       FROM stores s CROSS JOIN products p JOIN product_variants v ON v.product_id=p.id
       WHERE s.store_code IN ('HYD-GAC-001','HYD-MAD-001','HYD-KON-001')`,
    );
    const category = await client.query<{id:string}>(`INSERT INTO categories(slug,name) VALUES ('men','Men') RETURNING id::text`);
    const child = await client.query<{id:string}>(`INSERT INTO categories(parent_id,slug,name) VALUES ($1,'men-tshirts','T-shirts') RETURNING id::text`,[category.rows[0]!.id]);
    const fashion = await client.query<{id:string}>(`INSERT INTO products(sku,name,description,brand,category,category_id,price,rating,in_stock,created_at) VALUES ('FASH-TEST','Zeta Fashion Tee','Fashion fixture','ThreadLane','T-shirts',$1,100,1.0,TRUE,'2020-01-01') RETURNING id::text`,[child.rows[0]!.id]);
    await client.query(`INSERT INTO product_variants(product_id,sku,gender,size,size_system,color,color_code,material,fit,style) VALUES
      ($1,'FASH-TEST-BLK-M','men','M','Alpha','Black','#111111','Cotton','Regular','Casual'),
      ($1,'FASH-TEST-BLK-L','men','L','Alpha','Black','#111111','Cotton','Regular','Casual'),
      ($1,'FASH-TEST-IVR-M','men','M','Alpha','Ivory','#F4F0E6','Cotton','Regular','Casual')`,[fashion.rows[0]!.id]);
    await client.query(`INSERT INTO store_inventory(store_id,product_id,variant_id,stock_quantity,selling_price,is_available)
      SELECT s.id,v.product_id,v.id,CASE WHEN v.size='L' THEN 0 ELSE 4 END,CASE WHEN s.store_code='HYD-GAC-001' THEN 949 ELSE 999 END,TRUE
      FROM stores s CROSS JOIN product_variants v WHERE s.store_code IN ('HYD-GAC-001','HYD-MAD-001') AND v.product_id=$1`,[fashion.rows[0]!.id]);
  } finally { await client.end(); }
}
