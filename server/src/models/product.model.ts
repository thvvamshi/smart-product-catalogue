import type { QueryResultRow } from 'pg';
import { pool } from '../db/pool.js';
import type { Product, ProductCursor, ProductQuery, ProductSearchCandidate, ProductSort } from '../types/product.types.js';

type ProductRow = QueryResultRow & {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  price: string;
  rating: string;
  in_stock: boolean;
  created_at: Date;
  image_url: string | null;
};

const SORT_SQL: Record<ProductSort, string> = {
  price_asc: 'products.price ASC, products.id ASC',
  price_desc: 'products.price DESC, products.id DESC',
  rating_desc: '(-products.rating) ASC, products.id ASC',
  newest: 'products.created_at DESC, products.id DESC',
  name_asc: 'products.name ASC, products.id ASC',
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildFilters(query: ProductQuery): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    clauses.push(clause.replace('?', `$${values.length}`));
  };

  if (query.q) {
    values.push(`%${escapeLike(query.q)}%`);
    const placeholder = `$${values.length}`;
    clauses.push(`(name ILIKE ${placeholder} ESCAPE '\\' OR description ILIKE ${placeholder} ESCAPE '\\' OR brand ILIKE ${placeholder} ESCAPE '\\' OR category ILIKE ${placeholder} ESCAPE '\\' OR sku ILIKE ${placeholder} ESCAPE '\\')`);
  }
  if (query.category) add('category = ?', query.category);
  if (query.brand) add('brand = ?', query.brand);
  if (query.minPrice !== undefined) add('price >= ?', query.minPrice);
  if (query.maxPrice !== undefined) add('price <= ?', query.maxPrice);
  if (query.minRating !== undefined) add('rating >= ?', query.minRating);
  if (query.inStock !== undefined) add('in_stock = ?', query.inStock);
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function buildCursorPredicate(cursor: ProductCursor, values: unknown[]): string {
  values.push(cursor.key, cursor.id);
  const key = `$${values.length - 1}`;
  const id = `$${values.length}`;
  switch (cursor.sort) {
    case 'price_asc': return `(products.price, products.id) > (${key}::numeric, ${id}::bigint)`;
    case 'price_desc': return `(products.price, products.id) < (${key}::numeric, ${id}::bigint)`;
    case 'rating_desc': return `((-products.rating), products.id) > ((-${key}::numeric), ${id}::bigint)`;
    case 'newest': return `(products.created_at, products.id) < (${key}::timestamptz, ${id}::bigint)`;
    case 'name_asc': return `(products.name, products.id) > (${key}, ${id}::bigint)`;
  }
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    brand: row.brand,
    category: row.category,
    price: Number(row.price),
    rating: Number(row.rating),
    inStock: row.in_stock,
    createdAt: row.created_at.toISOString(),
    imageUrl: row.image_url,
  };
}

function cursorKey(row: ProductRow, sort: ProductSort): string {
  if (sort === 'price_asc' || sort === 'price_desc') return row.price;
  if (sort === 'rating_desc') return row.rating;
  if (sort === 'newest') return row.created_at.toISOString();
  return row.name;
}

export async function searchProducts(query: ProductQuery): Promise<ProductSearchCandidate[]> {
  const where = buildFilters(query);
  const values = [...where.values];
  const cursorClause = query.cursor ? buildCursorPredicate(query.cursor, values) : '';
  const whereSql = cursorClause ? `${where.sql || 'WHERE'}${where.sql ? ' AND ' : ' '}${cursorClause}` : where.sql;
  values.push(query.limit + 1);
  const result = await pool.query<ProductRow>(
    `SELECT id::text, sku, name, description, brand, category, price::text, rating::text, in_stock, created_at, image_url
     FROM products ${whereSql} ORDER BY ${SORT_SQL[query.sort]} LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({ product: mapProduct(row), cursorKey: cursorKey(row, query.sort) }));
}

export async function findProductById(id: string): Promise<Product | null> {
  const result = await pool.query<ProductRow>(
    `SELECT id::text, sku, name, description, brand, category, price::text, rating::text, in_stock, created_at, image_url
     FROM products WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}
