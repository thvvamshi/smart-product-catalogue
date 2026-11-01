import { findNearbyStores, findNearestServiceableStore, findStoreById, findStoreInventory } from '../models/store.model.js';
import type { NearbyStoreQuery, ServiceabilityQuery, StoreInventoryQuery } from '../types/store.types.js';
import { encodeInventoryCursor } from '../utils/inventory-cursor.js';

export async function listNearbyStores(query: NearbyStoreQuery) {
  const data = await findNearbyStores(query);
  return { data, meta: { count: data.length, searchRadiusKm: query.radiusKm } };
}

export async function checkServiceability(query: ServiceabilityQuery) {
  const nearest = await findNearestServiceableStore(query.latitude, query.longitude);
  return { data: { isServiceable: nearest !== null, customerLocation: query, nearestStore: nearest ? {
    id: nearest.id, name: nearest.name, area: nearest.area, distanceKm: nearest.distanceKm,
    deliveryRadiusKm: nearest.deliveryRadiusKm, isDemo: nearest.isDemo,
  } : null } };
}

export async function getStore(id: string) { return findStoreById(id); }

export async function listStoreInventory(storeId: string, query: StoreInventoryQuery) {
  const store = await findStoreById(storeId);
  if (!store) return null;
  const candidates = await findStoreInventory(storeId, query);
  const hasNextPage = candidates.length > query.limit;
  const page = hasNextPage ? candidates.slice(0, query.limit) : candidates;
  const last = page.at(-1);
  return { data: page.map(({ item }) => item), pagination: {
    limit: query.limit, hasNextPage,
    nextCursor: hasNextPage && last ? encodeInventoryCursor({ version: 1, productId: last.productId }) : null,
  } };
}
