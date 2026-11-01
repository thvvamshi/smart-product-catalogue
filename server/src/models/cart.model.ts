import { pool } from "../db/pool.js";
import type { CartLine } from "../types/commerce.types.js";
import { CommerceError } from "../utils/commerce-error.js";
import type { Pool, PoolClient } from "pg";
type LineRow = {
  id: string;
  variant_id: string;
  store_id: string;
  product_id: string;
  name: string;
  brand: string;
  image_url: string | null;
  sku: string;
  size: string | null;
  color: string | null;
  quantity: number;
  price_snapshot: string;
  current_price: string;
  stock_quantity: number;
  available: boolean;
  price_changed: boolean;
  store_name: string;
  line_subtotal: string;
  store_subtotal: string;
  cart_subtotal: string;
};
export async function activeCartId(
  sessionId: string,
  create = true,
  client: Pool | PoolClient = pool,
) {
  let result = await client.query<{ id: string }>(
    `SELECT id::text FROM carts WHERE session_id=$1 AND status='active'`,
    [sessionId],
  );
  if (!result.rows[0] && create) {
    await client.query(
      `INSERT INTO carts(session_id) VALUES($1) ON CONFLICT(session_id) WHERE status='active' DO NOTHING`,
      [sessionId],
    );
    result = await client.query(
      `SELECT id::text FROM carts WHERE session_id=$1 AND status='active'`,
      [sessionId],
    );
  }
  return result.rows[0]?.id ?? null;
}
export async function cartLines(sessionId: string): Promise<LineRow[]> {
  return (
    await pool.query<LineRow>(
      `SELECT ci.id::text,ci.variant_id::text,ci.store_id::text,p.id::text product_id,p.name,p.brand,p.image_url,v.sku,v.size,v.color,ci.quantity,ci.unit_price_snapshot::text price_snapshot,i.selling_price::text current_price,i.stock_quantity,(v.is_active AND s.is_active AND i.is_available AND i.stock_quantity>=ci.quantity) available,(ci.unit_price_snapshot<>i.selling_price) price_changed,s.name store_name,(i.selling_price*ci.quantity)::text line_subtotal,SUM(i.selling_price*ci.quantity)OVER(PARTITION BY s.id)::text store_subtotal,SUM(i.selling_price*ci.quantity)OVER()::text cart_subtotal FROM carts c JOIN cart_items ci ON ci.cart_id=c.id JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=ci.store_id JOIN store_inventory i ON i.store_id=ci.store_id AND i.variant_id=ci.variant_id WHERE c.session_id=$1 AND c.status='active' ORDER BY s.id,ci.id`,
      [sessionId],
    )
  ).rows;
}
export async function cartStoreEtaInputs(sessionId: string) {
  return (await pool.query<{ store_id: string; store_name: string; latitude: string; longitude: string; delivery_radius_km: string; preparation_time_minutes: number }>(
    `SELECT DISTINCT ON (s.id) s.id::text store_id,s.name store_name,s.latitude::text,s.longitude::text,s.delivery_radius_km::text,s.preparation_time_minutes
     FROM carts c JOIN cart_items ci ON ci.cart_id=c.id JOIN stores s ON s.id=ci.store_id
     WHERE c.session_id=$1 AND c.status='active' AND s.is_active ORDER BY s.id`,
    [sessionId],
  )).rows;
}
export function mapLine(r: LineRow): CartLine {
  return {
    id: r.id,
    variantId: r.variant_id,
    storeId: r.store_id,
    productId: r.product_id,
    name: r.name,
    brand: r.brand,
    imageUrl: r.image_url,
    sku: r.sku,
    size: r.size,
    color: r.color,
    quantity: r.quantity,
    priceSnapshot: r.price_snapshot,
    currentPrice: r.current_price,
    stockQuantity: r.stock_quantity,
    available: r.available,
    priceChanged: r.price_changed,
    storeName: r.store_name,
    lineSubtotal: r.line_subtotal,
  };
}
export async function addItem(
  sessionId: string,
  variantId: string,
  storeId: string,
  quantity: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cartId = await activeCartId(sessionId, true, client);
    await client.query("SELECT id FROM carts WHERE id=$1 FOR UPDATE", [cartId]);
    const inventory = (
      await client.query<{ selling_price: string; stock_quantity: number }>(
        `SELECT i.selling_price::text,i.stock_quantity FROM store_inventory i JOIN stores s ON s.id=i.store_id JOIN product_variants v ON v.id=i.variant_id WHERE i.store_id=$1 AND i.variant_id=$2 AND i.is_available AND s.is_active AND v.is_active`,
        [storeId, variantId],
      )
    ).rows[0];
    if (!inventory)
      throw new CommerceError(
        "INVENTORY_NOT_AVAILABLE",
        "The selected active store does not stock this active variant",
        409,
      );
    const existing = (
      await client.query<{ store_id: string; quantity: number }>(
        `SELECT store_id::text,quantity FROM cart_items WHERE cart_id=$1 AND variant_id=$2 FOR UPDATE`,
        [cartId, variantId],
      )
    ).rows[0];
    if (existing && existing.store_id !== storeId)
      throw new CommerceError(
        "STORE_CONFLICT",
        "This variant is already in the cart from another store",
        409,
      );
    const next = (existing?.quantity ?? 0) + quantity;
    if (next > 99)
      throw new CommerceError(
        "QUANTITY_LIMIT",
        "Cart quantity cannot exceed 99",
        400,
      );
    await client.query(
      `INSERT INTO cart_items(cart_id,variant_id,store_id,quantity,unit_price_snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cart_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit_price_snapshot=EXCLUDED.unit_price_snapshot,updated_at=NOW()`,
      [cartId, variantId, storeId, next, inventory.selling_price],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function updateItem(
  sessionId: string,
  itemId: string,
  quantity: number,
) {
  const result = await pool.query(
    `UPDATE cart_items ci SET quantity=$1,unit_price_snapshot=i.selling_price,updated_at=NOW() FROM carts c,store_inventory i WHERE ci.id=$2 AND ci.cart_id=c.id AND c.session_id=$3 AND c.status='active' AND i.store_id=ci.store_id AND i.variant_id=ci.variant_id RETURNING ci.id`,
    [quantity, itemId, sessionId],
  );
  if (!result.rowCount)
    throw new CommerceError("NOT_FOUND", "Cart item not found", 404);
}
export async function removeItem(sessionId: string, itemId: string) {
  const result = await pool.query(
    `DELETE FROM cart_items ci USING carts c WHERE ci.id=$1 AND ci.cart_id=c.id AND c.session_id=$2 AND c.status='active' RETURNING ci.id`,
    [itemId, sessionId],
  );
  if (!result.rowCount)
    throw new CommerceError("NOT_FOUND", "Cart item not found", 404);
}
export async function clearCart(sessionId: string) {
  await pool.query(
    `DELETE FROM cart_items ci USING carts c WHERE ci.cart_id=c.id AND c.session_id=$1 AND c.status='active'`,
    [sessionId],
  );
}
