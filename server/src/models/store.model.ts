import type { QueryResultRow } from 'pg';
import { pool } from '../db/pool.js';
import type { NearbyStore, NearbyStoreQuery, Store, StoreInventoryCandidate, StoreInventoryQuery } from '../types/store.types.js';

type StoreRow = QueryResultRow & {
  id: string; store_code: string; name: string; description: string; address_line: string; landmark: string | null;
  area: string; city: string; state: string; postal_code: string; latitude: string; longitude: string;
  delivery_radius_km: string; preparation_time_minutes: number; is_demo: boolean;
};
type NearbyStoreRow = StoreRow & { distance_km: number };
type InventoryRow = QueryResultRow & {
  product_id: string; sku: string; name: string; brand: string; category: string; catalogue_price: string;
  selling_price: string; stock_quantity: number; is_available: boolean;
};

const distanceSql = `2 * 6371 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
  POWER(SIN(RADIANS(latitude::double precision - $1::double precision) / 2), 2) +
  COS(RADIANS($1::double precision)) * COS(RADIANS(latitude::double precision)) *
  POWER(SIN(RADIANS(longitude::double precision - $2::double precision) / 2), 2)
))))`;

function mapStore(row: StoreRow): Store {
  return { id: row.id, storeCode: row.store_code, name: row.name, description: row.description, addressLine: row.address_line,
    landmark: row.landmark, area: row.area, city: row.city, state: row.state, postalCode: row.postal_code,
    latitude: Number(row.latitude), longitude: Number(row.longitude), deliveryRadiusKm: Number(row.delivery_radius_km),
    preparationTimeMinutes: row.preparation_time_minutes, isDemo: row.is_demo };
}

function mapNearbyStore(row: NearbyStoreRow): NearbyStore {
  const store = mapStore(row);
  return {
    id: store.id, storeCode: store.storeCode, name: store.name, area: store.area, city: store.city,
    latitude: store.latitude, longitude: store.longitude, deliveryRadiusKm: store.deliveryRadiusKm,
    preparationTimeMinutes: store.preparationTimeMinutes, isDemo: store.isDemo,
    distanceKm: Number(row.distance_km.toFixed(2)), isServiceable: row.distance_km <= store.deliveryRadiusKm,
  };
}

export async function findNearbyStores(query: NearbyStoreQuery): Promise<NearbyStore[]> {
  const result = await pool.query<NearbyStoreRow>(
    `WITH store_distances AS (
       SELECT id::text, store_code, name, description, address_line, landmark, area, city, state, postal_code,
              latitude::text, longitude::text, delivery_radius_km::text, preparation_time_minutes, is_demo,
              ${distanceSql} AS distance_km
       FROM stores WHERE is_active = TRUE
     )
     SELECT * FROM store_distances WHERE distance_km <= $3 ORDER BY distance_km ASC, id::bigint ASC LIMIT $4`,
    [query.latitude, query.longitude, query.radiusKm, query.limit],
  );
  return result.rows.map(mapNearbyStore);
}

export async function findNearestServiceableStore(latitude: number, longitude: number): Promise<NearbyStore | null> {
  const result = await pool.query<NearbyStoreRow>(
    `WITH store_distances AS (
       SELECT id::text, store_code, name, description, address_line, landmark, area, city, state, postal_code,
              latitude::text, longitude::text, delivery_radius_km::text, preparation_time_minutes, is_demo,
              ${distanceSql} AS distance_km
       FROM stores WHERE is_active = TRUE
     )
     SELECT * FROM store_distances WHERE distance_km <= delivery_radius_km::numeric ORDER BY distance_km ASC, id::bigint ASC LIMIT 1`,
    [latitude, longitude],
  );
  const row = result.rows[0];
  return row ? { ...mapNearbyStore(row), isServiceable: true } : null;
}

export async function findStoreById(id: string): Promise<Store | null> {
  const result = await pool.query<StoreRow>(
    `SELECT id::text, store_code, name, description, address_line, landmark, area, city, state, postal_code,
            latitude::text, longitude::text, delivery_radius_km::text, preparation_time_minutes, is_demo
     FROM stores WHERE id = $1 AND is_active = TRUE`, [id],
  );
  return result.rows[0] ? mapStore(result.rows[0]) : null;
}

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, '\\$&'); }

export async function findStoreInventory(storeId: string, query: StoreInventoryQuery): Promise<StoreInventoryCandidate[]> {
  const values: unknown[] = [storeId];
  const clauses = ['i.store_id = $1'];
  if (query.q) {
    values.push(`%${escapeLike(query.q)}%`);
    const p = `$${values.length}`;
    clauses.push(`(p.name ILIKE ${p} ESCAPE '\\' OR p.sku ILIKE ${p} ESCAPE '\\' OR p.brand ILIKE ${p} ESCAPE '\\' OR p.category ILIKE ${p} ESCAPE '\\')`);
  }
  if (query.available !== undefined) clauses.push(query.available ? '(i.is_available = TRUE AND i.stock_quantity > 0)' : '(i.is_available = FALSE OR i.stock_quantity = 0)');
  if (query.cursor) {
    values.push(query.cursor.productId);
    clauses.push(`i.product_id > $${values.length}::bigint`);
  }
  values.push(query.limit + 1);
  const result = await pool.query<InventoryRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (i.product_id) i.product_id::text, p.sku, p.name, p.brand, p.category,
              p.price::text AS catalogue_price, i.selling_price::text, i.stock_quantity,
              (i.is_available AND i.stock_quantity > 0) AS is_available
       FROM store_inventory i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY i.product_id ASC,(i.is_available AND i.stock_quantity>0) DESC,i.variant_id ASC
     ) selected ORDER BY product_id::bigint ASC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({ productId: row.product_id, item: { productId: row.product_id, sku: row.sku, name: row.name,
    brand: row.brand, category: row.category, cataloguePrice: Number(row.catalogue_price), sellingPrice: Number(row.selling_price),
    stockQuantity: row.stock_quantity, isAvailable: row.is_available } }));
}
