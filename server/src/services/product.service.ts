import { findProductById, searchProducts } from '../models/product.model.js';
import type { ProductQuery, ProductSearchResponse } from '../types/product.types.js';
import { encodeProductCursor } from '../utils/product-cursor.js';

export async function listProducts(query: ProductQuery): Promise<ProductSearchResponse> {
  const candidates = await searchProducts(query);
  const hasNextPage = candidates.length > query.limit;
  const page = hasNextPage ? candidates.slice(0, query.limit) : candidates;
  const last = page.at(-1);
  const nextCursor = hasNextPage && last
    ? encodeProductCursor({ version: 1, sort: query.sort, key: last.cursorKey, id: last.product.id })
    : null;

  return {
    data: page.map(({ product }) => product),
    pagination: { limit: query.limit, nextCursor, hasNextPage },
  };
}

export async function getProduct(id: string) {
  return findProductById(id);
}
