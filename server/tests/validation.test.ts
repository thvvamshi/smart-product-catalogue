import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { closePool } from '../src/db/pool.js';

afterAll(closePool);

describe('query validation', () => {
  it.each([
    [{ minPrice: '-1' }, 'minPrice'], [{ maxPrice: 'x' }, 'maxPrice'], [{ minRating: '5.1' }, 'minRating'],
    [{ inStock: 'yes' }, 'inStock'], [{ sort: 'DROP TABLE' }, 'sort'], [{ cursor: 'not+a+cursor' }, 'cursor'],
    [{ cursor: 'e30' }, 'cursor'], [{ page: '2' }, ''], [{ limit: '101' }, 'limit'], [{ extra: 'nope' }, ''],
  ])('rejects invalid query %j', async (query, path) => {
    const response = await request(app).get('/api/products').query(query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    if (path) expect(response.body.error.details.some((d: { path: string }) => d.path === path)).toBe(true);
  });

  it('rejects an inverted price range', async () => {
    const response = await request(app).get('/api/products').query({ minPrice: '100', maxPrice: '20' });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('less than or equal');
  });

  it('accepts the maximum page size', async () => {
    const response = await request(app).get('/api/products?limit=100');
    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(100);
  });

  it('rejects a cursor created for a different sort mode', async () => {
    const first = await request(app).get('/api/products?sort=price_asc&limit=1');
    const response = await request(app).get('/api/products').query({ sort: 'newest', cursor: first.body.pagination.nextCursor });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0]).toMatchObject({ path: 'cursor', message: 'cursor does not match the selected sort' });
  });

  it('rejects malformed product ids', async () => {
    expect((await request(app).get('/api/products/abc')).status).toBe(400);
    expect((await request(app).get('/api/products/0')).status).toBe(400);
  });
});
