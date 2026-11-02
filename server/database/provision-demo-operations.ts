import pg from 'pg';
import { env } from '../src/config/env.js';

/**
 * Repairs deterministic demo authorization identities without reseeding
 * catalogue/store data or touching inventory, carts, orders, or delivery
 * tasks. Remote execution is deliberately opt-in.
 */
const target = new URL(env.DATABASE_URL);
const isLocalTarget = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);

if (!isLocalTarget && !process.argv.includes('--allow-remote')) {
  throw new Error('Refusing to provision demo operations on a non-local database without --allow-remote.');
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query('BEGIN');
  const dispatcher = (await client.query<{ identity_key: string; role: string; is_active: boolean }>(
    `INSERT INTO delivery_dispatchers (identity_key, role, is_active)
     VALUES ('demo-dispatcher-admin', 'admin', TRUE)
     ON CONFLICT (identity_key)
     DO UPDATE SET role = EXCLUDED.role, is_active = TRUE
     RETURNING identity_key, role, is_active`,
  )).rows[0]!;
  const operators = await client.query<{ count: string }>(
    `WITH demo_stores AS (
       SELECT id, 'demo-operator-' || store_code AS operator_key
       FROM stores
       WHERE is_demo AND is_active
     ), provisioned AS (
       INSERT INTO store_operators (operator_key, store_id, is_active)
       SELECT operator_key, id, TRUE FROM demo_stores
       ON CONFLICT (operator_key)
       DO UPDATE SET store_id = EXCLUDED.store_id, is_active = TRUE
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM provisioned`,
  );
  const agent = (await client.query<{ agent_code: string; identity_key: string; status: string; availability: string }>(
    `INSERT INTO delivery_agents (agent_code, identity_key, name, phone, status, availability)
     VALUES ('DEMO-AGENT-001', 'demo-agent-001', 'Demo Delivery Agent', '9876543210', 'active', 'available')
     ON CONFLICT (agent_code)
     DO UPDATE SET identity_key = EXCLUDED.identity_key,
                   name = EXCLUDED.name,
                   phone = EXCLUDED.phone,
                   status = 'active'
     RETURNING agent_code, identity_key, status, availability`,
  )).rows[0]!;
  await client.query('COMMIT');
  console.log(`Provisioned ${dispatcher.identity_key} (${dispatcher.role}, active=${dispatcher.is_active}), ${operators.rows[0]!.count} demo store operator mappings, and ${agent.agent_code} (${agent.availability}).`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
