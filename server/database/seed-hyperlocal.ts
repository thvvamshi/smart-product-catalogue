import pg from 'pg';
import { env } from '../src/config/env.js';
import { demoStores } from './hyperlocal-data.js';

const target = new URL(env.DATABASE_URL);
const isLocalTarget = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
if (!isLocalTarget && !process.argv.includes('--allow-remote')) {
  throw new Error('Refusing to seed demo stores into a non-local database without the explicit --allow-remote flag.');
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
let transactionStarted = false;

try {
  await client.connect();
  await client.query('BEGIN');
  transactionStarted = true;
  const productCount = Number((await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products')).rows[0]?.count ?? 0);
  if (productCount === 0) throw new Error('Seed products before hyperlocal inventory.');

  // Catalogue products from the original seed have no explicit fashion
  // variants. Give those products one deterministic compatibility variant so
  // store_inventory remains variant-level without duplicating inventory data.
  await client.query(`
    INSERT INTO product_variants (product_id, sku, attributes)
    SELECT p.id, p.sku, '{}'::jsonb
    FROM products p
    WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
    ON CONFLICT (sku) DO NOTHING
  `);

  for (const [index, store] of demoStores.entries()) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO stores (store_code, name, description, address_line, landmark, area, city, state, postal_code, latitude, longitude, delivery_radius_km, preparation_time_minutes, is_active, is_demo, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE,NOW())
       ON CONFLICT (store_code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, address_line=EXCLUDED.address_line, landmark=EXCLUDED.landmark, area=EXCLUDED.area, city=EXCLUDED.city, state=EXCLUDED.state, postal_code=EXCLUDED.postal_code, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, delivery_radius_km=EXCLUDED.delivery_radius_km, preparation_time_minutes=EXCLUDED.preparation_time_minutes, is_demo=TRUE, updated_at=NOW()
       RETURNING id::text`,
      [store.storeCode, store.name, store.description, store.addressLine, store.landmark, store.area, store.city, store.state, store.postalCode, store.latitude, store.longitude, store.deliveryRadiusKm, store.preparationTimeMinutes],
    );
    const storeId = result.rows[0]!.id;
    await client.query(
      `INSERT INTO store_inventory (store_id, product_id, variant_id, stock_quantity, selling_price, is_available, updated_at)
       SELECT $1::bigint, p.id, v.id, MOD((p.id * ($2::bigint + 3)), 31)::integer,
              ROUND((p.price * (0.97 + MOD(p.id + $2::bigint, 7)::numeric / 100))::numeric, 2),
              MOD(p.id + $2::bigint, 13) <> 0, NOW()
       FROM products p JOIN product_variants v ON v.product_id = p.id
       WHERE MOD(p.id + $2::bigint, 3) = 0 OR MOD(p.id + $2::bigint, 11) = 0
       ON CONFLICT (store_id, variant_id) DO UPDATE SET product_id=EXCLUDED.product_id, stock_quantity=EXCLUDED.stock_quantity, selling_price=EXCLUDED.selling_price, is_available=EXCLUDED.is_available, updated_at=NOW()`,
      [storeId, index + 1],
    );
    await client.query(
      `INSERT INTO store_operators (operator_key, store_id, is_active)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (operator_key) DO UPDATE SET store_id=EXCLUDED.store_id,is_active=TRUE`,
      [`demo-operator-${store.storeCode}`, storeId],
    );
  }

  await client.query(
    `INSERT INTO delivery_dispatchers (identity_key, role, is_active)
     VALUES ('demo-dispatcher-admin','admin',TRUE)
     ON CONFLICT (identity_key) DO UPDATE SET role='admin',is_active=TRUE`,
  );
  await client.query(
    `INSERT INTO delivery_agents (agent_code, identity_key, name, phone, status, availability)
     VALUES ('DEMO-AGENT-001','demo-agent-001','Demo Delivery Agent','9876543210','active','available')
     ON CONFLICT (agent_code) DO UPDATE SET identity_key=EXCLUDED.identity_key,name=EXCLUDED.name,phone=EXCLUDED.phone,status='active'`,
  );

  await client.query('COMMIT');
  transactionStarted = false;
  console.log(`Seeded ${demoStores.length} deterministic Hyderabad demo stores and inventory.`);
} catch (error) {
  if (transactionStarted) await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
