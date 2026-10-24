import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';

afterAll(closePool);

describe('product API', () => {
  it('reports application and database health', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/health/db')).body.database).toBe('connected');
  });

  it.each([
    ['exact/partial name', 'q=Orbit%20Pro', 'CAM-PRO-001'],
    ['description', 'q=lumbar', 'HOME-CHAIR-1'],
    ['brand', 'q=bluepeak', 'BOOK-SQL-001'],
    ['category', 'q=sports', 'SPORT-RUN-01'],
    ['SKU', 'q=audio-1', 'ELEC-AUDIO-1'],
    ['case-insensitive', 'q=WiReLeSs', 'ELEC-AUDIO-1'],
  ])('searches by %s', async (_label, query, sku) => {
    const response = await request(app).get(`/api/products?${query}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((p: { sku: string }) => p.sku)).toContain(sku);
  });

  it('treats SQL wildcard characters literally', async () => {
    const percent = await request(app).get('/api/products').query({ q: '100%' });
    expect(percent.body.data.map((p: { sku: string }) => p.sku)).toEqual(['TEST-ALPHA-100']);
    const underscore = await request(app).get('/api/products').query({ q: 'Coder_' });
    expect(underscore.body.data.map((p: { sku: string }) => p.sku)).toEqual(['TEST-UNDER_SCORE']);
  });

  it('combines every active filter with AND', async () => {
    const response = await request(app).get('/api/products').query({ q: 'chair', category: 'Home', brand: 'Cedar & Co', minPrice: '200', maxPrice: '250', minRating: '4.2', inStock: 'true' });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ sku: 'HOME-CHAIR-1', price: 249, rating: 4.2, inStock: true });
  });

  it('supports out-of-stock filtering', async () => {
    const response = await request(app).get('/api/products').query({ inStock: 'false' });
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.every((p: { inStock: boolean }) => !p.inStock)).toBe(true);
  });

  it.each([
    ['price_asc', ['TEST-ALPHA-100', 'BOOK-SQL-001']],
    ['price_desc', ['CAM-PRO-001', 'HOME-CHAIR-2']],
    ['rating_desc', ['TEST-UNDER_SCORE', 'CAM-PRO-001']],
    ['newest', ['ELEC-AUDIO-1', 'SPORT-RUN-01']],
    ['name_asc', ['TEST-ALPHA-100', 'HOME-CHAIR-2']],
  ])('sorts using %s', async (sort, firstTwo) => {
    const response = await request(app).get('/api/products').query({ sort });
    expect(response.body.data.slice(0, 2).map((p: { sku: string }) => p.sku)).toEqual(firstTwo);
  });

  it('uses stable id tie breakers', async () => {
    const asc = await request(app).get('/api/products').query({ category: 'Home', sort: 'price_asc' });
    expect(asc.body.data.filter((p: { price: number }) => p.price === 249).map((p: { sku: string }) => p.sku)).toEqual(['HOME-CHAIR-1', 'HOME-CHAIR-2']);
    const desc = await request(app).get('/api/products').query({ category: 'Home', sort: 'price_desc' });
    expect(desc.body.data.filter((p: { price: number }) => p.price === 249).map((p: { sku: string }) => p.sku)).toEqual(['HOME-CHAIR-2', 'HOME-CHAIR-1']);
  });

  it('returns the first and next cursor pages while preserving active filters', async () => {
    const first = await request(app).get('/api/products').query({ brand: 'Cedar & Co', limit: 1, sort: 'name_asc' });
    expect(first.body.data.map((p: { sku: string }) => p.sku)).toEqual(['HOME-CHAIR-2']);
    expect(first.body.pagination).toMatchObject({ limit: 1, hasNextPage: true });
    expect(first.body.pagination.nextCursor).toEqual(expect.any(String));

    const next = await request(app).get('/api/products').query({ brand: 'Cedar & Co', limit: 1, sort: 'name_asc', cursor: first.body.pagination.nextCursor });
    expect(next.body.data.map((p: { sku: string }) => p.sku)).toEqual(['HOME-CHAIR-1']);
    expect(next.body.pagination).toEqual({ limit: 1, nextCursor: null, hasNextPage: false });
  });

  it('continues correctly through equal sort values using the id tie-breaker', async () => {
    const first = await request(app).get('/api/products').query({ category: 'Home', sort: 'price_asc', limit: 2 });
    expect(first.body.data.map((p: { sku: string }) => p.sku)).toEqual(['TEST-UNDER_SCORE', 'HOME-CHAIR-1']);
    const next = await request(app).get('/api/products').query({ category: 'Home', sort: 'price_asc', limit: 2, cursor: first.body.pagination.nextCursor });
    expect(next.body.data.map((p: { sku: string }) => p.sku)).toEqual(['HOME-CHAIR-2']);
  });

  it.each(['price_asc', 'price_desc', 'rating_desc', 'newest', 'name_asc'])('keyset-paginates every %s sort without gaps or duplicates', async (sort) => {
    const activeFilters = { minRating: '4', inStock: 'true' };
    const baseline = await request(app).get('/api/products').query({ sort, limit: 100, ...activeFilters });
    const expected = baseline.body.data.map((p: { sku: string }) => p.sku);
    const actual: string[] = [];
    let cursor: string | undefined;
    let requests = 0;
    do {
      const response = await request(app).get('/api/products').query({ sort, limit: 2, ...activeFilters, ...(cursor ? { cursor } : {}) });
      expect(response.status).toBe(200);
      actual.push(...response.body.data.map((p: { sku: string }) => p.sku));
      cursor = response.body.pagination.nextCursor ?? undefined;
      requests += 1;
    } while (cursor && requests < 10);
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it('uses one keyset query without COUNT or OFFSET', async () => {
    const spy = vi.spyOn(pool, 'query');
    const response = await request(app).get('/api/products?limit=2');
    const sql = spy.mock.calls.map(([query]) => String(query)).join(' ');
    spy.mockRestore();
    expect(response.status).toBe(200);
    expect(sql).not.toMatch(/COUNT\s*\(|OFFSET/i);
  });

  it('returns a successful empty result', async () => {
    const response = await request(app).get('/api/products?q=definitely-not-present');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], pagination: { limit: 20, nextCursor: null, hasNextPage: false } });
  });

  it('gets product detail and returns 404 for missing product', async () => {
    const found = await request(app).get('/api/products/1');
    expect(found.body.data).toMatchObject({ id: '1', sku: 'TEST-ALPHA-100', price: 29.99 });
    expect((await request(app).get('/api/products/99999')).status).toBe(404);
  });

  it('parameterizes SQL injection-like input', async () => {
    const response = await request(app).get('/api/products').query({ q: "%' OR 1=1; DROP TABLE products; --" });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect((await request(app).get('/api/products/1')).status).toBe(200);
  });

  it('returns a safe error when the database fails', async () => {
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('secret connection detail'));
    const response = await request(app).get('/api/products');
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
