import * as model from "../models/cart.model.js";
import type { CartMutation } from "../types/commerce.types.js";
import { calculateEta, overallEta } from "./eta.service.js";
export async function getCart(sessionId: string) {
  await model.activeCartId(sessionId, true);
  const rows = await model.cartLines(sessionId);
  const groups = [...new Set(rows.map((r) => r.store_id))].map((storeId) => {
    const selected = rows.filter((r) => r.store_id === storeId);
    return {
      store: { id: storeId, name: selected[0]!.store_name },
      items: selected.map(model.mapLine),
      itemCount: selected.reduce((count, row) => count + row.quantity, 0),
      subtotal: selected[0]!.store_subtotal,
    };
  });
  return {
    data: {
      currency: "INR",
      groups,
      itemCount: rows.reduce((count, row) => count + row.quantity, 0),
      subtotal: rows[0]?.cart_subtotal ?? "0.00",
    },
  };
}
export async function add(sessionId: string, input: CartMutation) {
  await model.addItem(
    sessionId,
    input.variantId,
    input.storeId,
    input.quantity,
  );
  return getCart(sessionId);
}
export async function update(
  sessionId: string,
  itemId: string,
  quantity: number,
) {
  await model.updateItem(sessionId, itemId, quantity);
  return getCart(sessionId);
}
export async function remove(sessionId: string, itemId: string) {
  await model.removeItem(sessionId, itemId);
  return getCart(sessionId);
}
export async function clear(sessionId: string) {
  await model.clearCart(sessionId);
  return getCart(sessionId);
}
export async function estimateDelivery(sessionId: string, latitude: number, longitude: number) {
  const stores = await model.cartStoreEtaInputs(sessionId);
  const groups = stores.map((store) => {
    const calculated = calculateEta({
      storeLatitude: Number(store.latitude),
      storeLongitude: Number(store.longitude),
      customerLatitude: latitude,
      customerLongitude: longitude,
      preparationMinutes: store.preparation_time_minutes,
    });
    return {
      storeId: store.store_id,
      storeName: store.store_name,
      eta: calculated && calculated.metadata.distanceKm <= Number(store.delivery_radius_km) ? calculated : null,
    };
  });
  return { data: { groups, eta: overallEta(groups.map((group) => ({ storeId: group.storeId, estimate: group.eta, active: Boolean(group.eta) }))) } };
}
