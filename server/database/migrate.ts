import pg from 'pg';
import { env } from '../src/config/env.js';
import { applyMigrations } from './migration-runner.js';

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

const databaseTarget = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(databaseTarget.hostname)) {
  throw new Error(`Refusing migrations against non-local database host: ${databaseTarget.hostname}`);
}

try {
  await client.connect();
  const executed = await applyMigrations(client);
  console.log(executed.length ? `Applied migrations: ${executed.join(', ')}` : 'No pending migrations.');
} finally {
  await client.end();
}
