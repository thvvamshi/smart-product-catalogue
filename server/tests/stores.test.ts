import pg from 'pg';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../database/migration-runner.js';
import { app } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';

afterAll(closePool);

async function storeId(code = 'HYD-GAC-001') {
  return (await pool.query<{ id: string }>('SELECT id::text FROM stores WHERE store_code=$1', [code])).rows[0]!.id;
}

function haversineKm(latitude1: number, longitude1: number, latitude2: number, longitude2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

describe('hyperlocal database foundation', () => {
  it('creates stores, inventory, constraints, and preserves products', async () => {
    const tables = await pool.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('stores','store_inventory') ORDER BY table_name");
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(['store_inventory', 'stores']);
    expect(Number((await pool.query('SELECT COUNT(*) AS count FROM products')).rows[0].count)).toBe(9);
  });

  it('applies migrations idempotently', async () => {
    const connectionString = process.env.DATABASE_URL!;
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      expect(await applyMigrations(client)).toEqual([]);
      expect(await applyMigrations(client)).toEqual([]);
      const count = await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename='001_create_hyperlocal_foundation.sql'");
      expect(count.rows[0].count).toBe(1);
    } finally { await client.end(); }
  });

  it('rolls back a failed migration without recording it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'catalogue-migrations-'));
    await writeFile(path.join(directory, '999_failure_probe.sql'), 'CREATE TABLE migration_rollback_probe (id integer); SELECT missing_column FROM migration_rollback_probe;');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL! });
    await client.connect();
    try {
      await expect(applyMigrations(client, directory)).rejects.toThrow();
      expect((await client.query("SELECT to_regclass('public.migration_rollback_probe') AS name")).rows[0].name).toBeNull();
      expect(Number((await client.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename='999_failure_probe.sql'")).rows[0].count)).toBe(0);
    } finally { await client.end(); await rm(directory, { recursive: true, force: true }); }
  });

  it('enforces store and inventory integrity constraints', async () => {
    await expect(pool.query(`INSERT INTO stores (store_code,name,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes) VALUES ('HYD-GAC-001','Duplicate','A','Hyderabad','Telangana','500000',1,1,1,1)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO stores (store_code,name,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes) VALUES ('BAD-LAT','Bad','A','Hyderabad','Telangana','500000',91,1,1,1)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO stores (store_code,name,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes) VALUES ('BAD-LON','Bad','A','Hyderabad','Telangana','500000',1,181,1,1)`)).rejects.toThrow();
    const id = await storeId();
    await expect(pool.query('INSERT INTO store_inventory (store_id,product_id,stock_quantity,selling_price) VALUES ($1,1,-1,1)', [id])).rejects.toThrow();
    await expect(pool.query('INSERT INTO store_inventory (store_id,product_id,stock_quantity,selling_price) VALUES ($1,1,1,-1)', [id])).rejects.toThrow();
    await expect(pool.query('INSERT INTO store_inventory (store_id,product_id,stock_quantity,selling_price) VALUES ($1,1,1,1)', [id])).rejects.toThrow();
    await expect(pool.query('INSERT INTO store_inventory (store_id,product_id,stock_quantity,selling_price) VALUES (999999,1,1,1)')).rejects.toThrow();
  });
});

describe('nearby stores API', () => {
  it('returns multiple Hyderabad stores ordered by calculated distance with string ids', async () => {
    const response = await request(app).get('/api/stores/nearby').query({ latitude: '17.4401', longitude: '78.3489', radiusKm: '10', limit: '10' });
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(1);
    expect(typeof response.body.data[0].id).toBe('string');
    expect(response.body.data[0]).toMatchObject({ area: 'Gachibowli', distanceKm: 0, isDemo: true, isServiceable: true });
    const distances = response.body.data.map((store: { distanceKm: number }) => store.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const second = response.body.data[1] as { latitude: number; longitude: number; distanceKm: number };
    expect(second.distanceKm).toBeCloseTo(haversineKm(17.4401, 78.3489, second.latitude, second.longitude), 2);
    expect(response.body.meta).toEqual({ count: response.body.data.length, searchRadiusKm: 10 });
  });

  it('respects radius and excludes inactive stores', async () => {
    const response = await request(app).get('/api/stores/nearby').query({ latitude: '17.4401', longitude: '78.3489', radiusKm: '0.2' });
    expect(response.body.data.map((store: { storeCode: string }) => store.storeCode)).toEqual(['HYD-GAC-001']);
  });

  it('returns an empty nearby result for a distant valid location', async () => {
    const response = await request(app).get('/api/stores/nearby').query({ latitude: '28.6139', longitude: '77.2090', radiusKm: '1' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { count: 0, searchRadiusKm: 1 } });
  });

  it.each([{ longitude: '78' }, { latitude: '17' }, { latitude: '91', longitude: '78' }, { latitude: '17', longitude: '181' }, { latitude: '17', longitude: '78', radiusKm: '0' }, { latitude: '17', longitude: '78', limit: '51' }])('rejects invalid nearby query %j', async (query) => {
    const response = await request(app).get('/api/stores/nearby').query(query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('serviceability API', () => {
  it('selects the nearest active serviceable store when several are nearby', async () => {
    const response = await request(app).get('/api/stores/serviceability').query({ latitude: '17.4401', longitude: '78.3489' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ isServiceable: true, customerLocation: { latitude: 17.4401, longitude: 78.3489 }, nearestStore: { area: 'Gachibowli', distanceKm: 0, isDemo: true } });
    expect(response.body.data.nearestStore.name).not.toContain('Inactive');
  });

  it('returns a valid unavailable result outside every delivery radius', async () => {
    const response = await request(app).get('/api/stores/serviceability').query({ latitude: '28.6139', longitude: '77.2090' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ isServiceable: false, customerLocation: { latitude: 28.6139, longitude: 77.209 }, nearestStore: null });
  });

  it('treats the configured delivery-radius boundary as serviceable', async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO stores (store_code,name,area,city,state,postal_code,latitude,longitude,delivery_radius_km,preparation_time_minutes,is_demo)
       VALUES ('BOUNDARY-DEMO','Boundary Demo','Test Area','Test City','Test State','000000',10,10,1.00,1,TRUE)
       RETURNING id::text`,
    );
    try {
      const response = await request(app).get('/api/stores/serviceability').query({ latitude: '10.00898', longitude: '10' });
      expect(response.body.data.isServiceable).toBe(true);
      expect(response.body.data.nearestStore.id).toBe(inserted.rows[0]!.id);
    } finally { await pool.query("DELETE FROM stores WHERE store_code='BOUNDARY-DEMO'"); }
  });

  it.each([{ latitude: 'invalid', longitude: '78' }, { latitude: '-91', longitude: '78' }, { latitude: '17', longitude: '-181' }])('rejects invalid serviceability query %j', async (query) => {
    expect((await request(app).get('/api/stores/serviceability').query(query)).status).toBe(400);
  });
});

describe('store detail and inventory APIs', () => {
  it('returns public store detail and 404 for missing stores', async () => {
    const id = await storeId();
    const found = await request(app).get(`/api/stores/${id}`);
    expect(found.status).toBe(200);
    expect(found.body.data).toMatchObject({ id, storeCode: 'HYD-GAC-001', city: 'Hyderabad', isDemo: true });
    expect(found.body.data).not.toHaveProperty('isActive');
    expect((await request(app).get('/api/stores/999999')).status).toBe(404);
  });

  it('returns cursor-paginated inventory and follows the next cursor', async () => {
    const id = await storeId();
    const first = await request(app).get(`/api/stores/${id}/inventory`).query({ limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination).toMatchObject({ limit: 2, hasNextPage: true });
    const next = await request(app).get(`/api/stores/${id}/inventory`).query({ limit: 2, cursor: first.body.pagination.nextCursor });
    expect(next.status).toBe(200);
    expect(next.body.data.map((item: { productId: string }) => item.productId)).not.toEqual(first.body.data.map((item: { productId: string }) => item.productId));
  });

  it('searches products and filters available and out-of-stock inventory', async () => {
    const id = await storeId();
    const search = await request(app).get(`/api/stores/${id}/inventory`).query({ q: 'wireless' });
    expect(search.body.data.some((item: { name: string }) => /wireless/i.test(item.name))).toBe(true);
    const available = await request(app).get(`/api/stores/${id}/inventory`).query({ available: 'true' });
    expect(available.body.data.length).toBeGreaterThan(0);
    expect(available.body.data.every((item: { isAvailable: boolean; stockQuantity: number }) => item.isAvailable && item.stockQuantity > 0)).toBe(true);
    const unavailable = await request(app).get(`/api/stores/${id}/inventory`).query({ available: 'false' });
    expect(unavailable.body.data.length).toBeGreaterThan(0);
    expect(unavailable.body.data.every((item: { isAvailable: boolean }) => !item.isAvailable)).toBe(true);
  });

  it('handles missing stores, invalid ids, malformed cursors, and injection-like search safely', async () => {
    expect((await request(app).get('/api/stores/999999/inventory')).status).toBe(404);
    expect((await request(app).get('/api/stores/not-an-id/inventory')).status).toBe(400);
    const id = await storeId();
    expect((await request(app).get(`/api/stores/${id}/inventory?cursor=bad+cursor`)).status).toBe(400);
    const injection = await request(app).get(`/api/stores/${id}/inventory`).query({ q: "%' OR 1=1; DROP TABLE stores; --" });
    expect(injection.status).toBe(200);
    expect(injection.body.data).toEqual([]);
    expect((await request(app).get(`/api/stores/${id}`)).status).toBe(200);
  });
});
