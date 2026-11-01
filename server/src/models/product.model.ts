import type { QueryResultRow } from "pg";
import { pool } from "../db/pool.js";
import type {
  Product,
  ProductCursor,
  ProductQuery,
  ProductSearchCandidate,
  ProductSort,
} from "../types/product.types.js";

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
  price_asc: "products.price ASC, products.id ASC",
  price_desc: "products.price DESC, products.id DESC",
  rating_desc: "(-products.rating) ASC, products.id ASC",
  newest: "products.created_at DESC, products.id DESC",
  name_asc: "products.name ASC, products.id ASC",
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}
const SEARCH_TERMS = ["sunglasses","headphones","backpack","wallet","wallets","black","white","ivory","brown","green","red","blue","navy","yellow","orange","pink","purple","grey","gray","beige","maroon","cotton","linen","denim","leather","suede","synthetic","blend","stretch","sneaker","sneakers","shoes","shoe","sandals","formal","casual","shirt","tshirt","dress","jeans","trousers","kurta","kurtas","ethnic","wear","fashion","watch","watches","bag","bags","handbag","tee","slim","card","essential","oversized","graphic","straight","fit","festive","classic","everyday","premium","men","women","womens","unisex","accessories","lifestyle","tops","bottoms","jacket","hoodie","scarf","cap","ring","necklace","earrings"];
function searchTokens(value: string): string[] {
  const parts = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bt\s+shirt\b/g, "tshirt").trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (const part of parts) {
    let rest = part;
    while (rest) {
      const match = SEARCH_TERMS.filter((term) => rest.startsWith(term)).sort((a, b) => b.length - a.length)[0];
      if (!match) { if (rest.length >= 2) result.push(rest); break; }
      result.push(match === "tee" ? "tshirt" : match);
      rest = rest.slice(match.length);
    }
  }
  return [...new Set(result)];
}
const normalizedField=(field:string)=>`regexp_replace(lower(coalesce(${field},'')),'[^a-z0-9]','','g')`;
const spacedField=(field:string)=>`regexp_replace(lower(coalesce(${field},'')),'[^a-z0-9]+',' ','g')`;
const productFields=(alias:string)=>[`${alias}.name`,`${alias}.description`,`${alias}.brand`,`${alias}.category`,`${alias}.sku`].map(normalizedField);
const variantFields=(alias:string)=>[`${alias}.color`,`${alias}.size`,`${alias}.material`,`${alias}.fit`,`${alias}.style`,`${alias}.sku`,`${alias}.attributes::text`].map(normalizedField);
const productSpaced=(alias:string)=>`regexp_replace(concat_ws(' ',${[`${alias}.name`,`${alias}.description`,`${alias}.brand`,`${alias}.category`,`${alias}.sku`].map(spacedField).join(',')}),'(^| )t[ ]+shirt( |$)','\\1tshirt\\2','gi')`;
const variantSpaced=(alias:string)=>`regexp_replace(concat_ws(' ',${[`${alias}.color`,`${alias}.size`,`${alias}.material`,`${alias}.fit`,`${alias}.style`,`${alias}.sku`,`${alias}.attributes::text`].map(spacedField).join(',')}),'(^| )t[ ]+shirt( |$)','\\1tshirt\\2','gi')`;
const productDoc=(alias:string)=>`concat_ws(' ',${productFields(alias).join(',')})`;
const variantDoc=(alias:string)=>`concat_ws(' ',${variantFields(alias).join(',')})`;

function buildFilters(query: ProductQuery): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };

  if (query.q) {
    values.push(`%${escapeLike(normalizeSearch(query.q))}%`);
    const normalizedPlaceholder = `$${values.length}`;
    const tokens = searchTokens(query.q);
    const tokenClauses = tokens.map((token) => {
      values.push(token);
      const tokenPlaceholder = `$${values.length}`;
      values.push(token.length<=3?0.7:0.35);
      const thresholdPlaceholder=`$${values.length}`;
      return `(((${productSpaced('products')} ~* ('(^| )'||${tokenPlaceholder}||'( |$)')) OR (${tokenPlaceholder}='tshirt' AND ${productSpaced('products')} ~* '(^| )t[ ]*shirt( |$)')) OR EXISTS (SELECT 1 FROM regexp_split_to_table(${productSpaced('products')},'\\s+') AS term WHERE length(term)>=length(${tokenPlaceholder}) AND similarity(term,${tokenPlaceholder}) >= ${thresholdPlaceholder}) OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND ((${variantSpaced('pv')} ~* ('(^| )'||${tokenPlaceholder}||'( |$)')) OR (${tokenPlaceholder}='tshirt' AND ${variantSpaced('pv')} ~* '(^| )t[ ]*shirt( |$)') OR EXISTS (SELECT 1 FROM regexp_split_to_table(${variantSpaced('pv')},'\\s+') AS term WHERE length(term)>=length(${tokenPlaceholder}) AND similarity(term,${tokenPlaceholder}) >= ${thresholdPlaceholder}))))`;
    });
    clauses.push(
      `(${productDoc('products')} LIKE ${normalizedPlaceholder}${tokenClauses.length ? ` OR (${tokenClauses.join(' AND ')})` : ''})`,
    );
  }
  if (query.category) add("category = ?", query.category);
  if (query.brand) add("brand = ?", query.brand);
  if (query.minPrice !== undefined) add("price >= ?", query.minPrice);
  if (query.maxPrice !== undefined) add("price <= ?", query.maxPrice);
  if (query.minRating !== undefined) add("rating >= ?", query.minRating);
  if (query.inStock !== undefined) add("in_stock = ?", query.inStock);
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildCursorPredicate(
  cursor: ProductCursor,
  values: unknown[],
): string {
  values.push(cursor.key, cursor.id);
  const key = `$${values.length - 1}`;
  const id = `$${values.length}`;
  switch (cursor.sort) {
    case "price_asc":
      return `(products.price, products.id) > (${key}::numeric, ${id}::bigint)`;
    case "price_desc":
      return `(products.price, products.id) < (${key}::numeric, ${id}::bigint)`;
    case "rating_desc":
      return `((-products.rating), products.id) > ((-${key}::numeric), ${id}::bigint)`;
    case "newest":
      return `(products.created_at, products.id) < (${key}::timestamptz, ${id}::bigint)`;
    case "name_asc":
      return `(products.name, products.id) > (${key}, ${id}::bigint)`;
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
  if (sort === "price_asc" || sort === "price_desc") return row.price;
  if (sort === "rating_desc") return row.rating;
  if (sort === "newest") return row.created_at.toISOString();
  return row.name;
}

export async function searchProducts(
  query: ProductQuery,
): Promise<ProductSearchCandidate[]> {
  const where = buildFilters(query);
  const values = [...where.values];
  const cursorClause = query.cursor
    ? buildCursorPredicate(query.cursor, values)
    : "";
  const whereSql = cursorClause
    ? `${where.sql || "WHERE"}${where.sql ? " AND " : " "}${cursorClause}`
    : where.sql;
  values.push(query.limit + 1);
  const result = await pool.query<ProductRow>(
    `SELECT id::text, sku, name, description, brand, category, price::text, rating::text, in_stock, created_at, image_url
     FROM products ${whereSql} ORDER BY ${SORT_SQL[query.sort]} LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({
    product: mapProduct(row),
    cursorKey: cursorKey(row, query.sort),
  }));
}

export async function findProductById(id: string): Promise<Product | null> {
  const result = await pool.query<ProductRow>(
    `SELECT id::text, sku, name, description, brand, category, price::text, rating::text, in_stock, created_at, image_url
     FROM products WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}
