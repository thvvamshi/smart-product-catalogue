import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const defaultMigrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function applyMigrations(
  client: pg.Client,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort((left, right) => left.localeCompare(right));
  const appliedResult = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map(({ filename }) => filename));
  const executed: string[] = [];

  for (const filename of filenames) {
    if (applied.has(filename)) continue;
    const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      executed.push(filename);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return executed;
}
