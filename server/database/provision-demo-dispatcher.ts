import pg from 'pg';
import { env } from '../src/config/env.js';

/**
 * Repairs the single, known demo-wide dispatcher identity without touching
 * stores, inventory, carts, orders, or delivery tasks. Remote execution is
 * deliberately opt-in so it cannot be mistaken for a general seed command.
 */
const target = new URL(env.DATABASE_URL);
const isLocalTarget = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);

if (!isLocalTarget && !process.argv.includes('--allow-remote')) {
  throw new Error('Refusing to provision a demo dispatcher on a non-local database without --allow-remote.');
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  const result = await client.query<{ identity_key: string; role: string; is_active: boolean }>(
    `INSERT INTO delivery_dispatchers (identity_key, role, is_active)
     VALUES ('demo-dispatcher-admin', 'admin', TRUE)
     ON CONFLICT (identity_key)
     DO UPDATE SET role = EXCLUDED.role, is_active = TRUE
     RETURNING identity_key, role, is_active`,
  );
  const dispatcher = result.rows[0]!;
  console.log(`Provisioned demo dispatcher ${dispatcher.identity_key} (${dispatcher.role}, active=${dispatcher.is_active}).`);
} finally {
  await client.end();
}
