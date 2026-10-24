import type { ProductCursor, ProductSort } from '../types/product.types.js';

const sorts = new Set<ProductSort>(['price_asc', 'price_desc', 'rating_desc', 'newest', 'name_asc']);

export function encodeProductCursor(cursor: ProductCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeProductCursor(value: string): ProductCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 2048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length !== 4 || !['version', 'sort', 'key', 'id'].every((key) => keys.includes(key))) return null;
    if (parsed.version !== 1 || typeof parsed.sort !== 'string' || !sorts.has(parsed.sort as ProductSort)) return null;
    if (typeof parsed.key !== 'string' || typeof parsed.id !== 'string' || !/^[1-9]\d*$/.test(parsed.id)) return null;

    const sort = parsed.sort as ProductSort;
    if ((sort === 'price_asc' || sort === 'price_desc') && !/^\d+(?:\.\d{1,2})?$/.test(parsed.key)) return null;
    if (sort === 'rating_desc' && !/^(?:[0-4](?:\.\d)?|5(?:\.0)?)$/.test(parsed.key)) return null;
    if (sort === 'newest') {
      const date = new Date(parsed.key);
      if (Number.isNaN(date.getTime()) || date.toISOString() !== parsed.key) return null;
    }
    if (sort === 'name_asc' && (parsed.key.length === 0 || parsed.key.length > 255)) return null;

    return { version: 1, sort, key: parsed.key, id: parsed.id };
  } catch {
    return null;
  }
}
