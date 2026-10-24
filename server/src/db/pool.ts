import pg from 'pg';
import { env } from '../config/env.js';

const needsSsl = env.NODE_ENV === 'production';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => console.error('Unexpected idle database connection error:', error.message));

export async function closePool(): Promise<void> {
  await pool.end();
}
