import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { haversineSql } from "../db/haversine.js";
import type { ValidationIssue } from "../types/commerce.types.js";
import { CommerceError } from "../utils/commerce-error.js";
import { calculateHybridEta, isEtaFresh, overallEta } from "../services/eta.service.js";
import { insertSnapshots, reservationEstimates } from "./eta.model.js";
import { createFromReservation } from "./order.model.js";
import { publishDeliveryEvent } from "../realtime.js";

type CheckoutRow = {
  cart_id: string;
  item_id: string;
  variant_id: string;
  store_id: string;
  quantity: number;
  price_snapshot: string;
  current_price: string;
  stock_quantity: number;
  inventory_available: boolean;
  variant_active: boolean;
  store_active: boolean;
  store_name: string;
  sku: string;
  name: string;
  brand: string;
  size: string | null;
  color: string | null;
  distance_km: string;
  delivery_radius_km: string;
  store_latitude: string;
  store_longitude: string;
  customer_latitude: string;
  customer_longitude: string;
  preparation_time_minutes: number;
  line_subtotal: string;
  store_subtotal: string;
  subtotal: string;
};
const distance = haversineSql("a.latitude", "a.longitude", "s");
async function ownedAddress(
  client: PoolClient,
  sessionId: string,
  addressId: string,
) {
  const row = (
    await client.query(
      `SELECT id FROM customer_addresses WHERE id=$1 AND session_id=$2`,
      [addressId, sessionId],
    )
  ).rows[0];
  if (!row)
    throw new CommerceError("ADDRESS_NOT_FOUND", "Address not found", 404);
}
async function activeCart(client: PoolClient, sessionId: string, lock = false) {
  const result = await client.query<{ id: string }>(
    `SELECT id::text FROM carts WHERE session_id=$1 AND status='active'${lock ? " FOR UPDATE" : ""}`,
    [sessionId],
  );
  if (!result.rows[0])
    throw new CommerceError("CART_EMPTY", "Cart is empty", 409);
  return result.rows[0].id;
}
async function checkoutRows(
  client: PoolClient,
  cartId: string,
  addressId: string,
): Promise<CheckoutRow[]> {
  return (
    await client.query<CheckoutRow>(
      `SELECT ci.cart_id::text,ci.id::text item_id,ci.variant_id::text,ci.store_id::text,ci.quantity,ci.unit_price_snapshot::text price_snapshot,i.selling_price::text current_price,i.stock_quantity,i.is_available inventory_available,v.is_active variant_active,s.is_active store_active,s.name store_name,v.sku,p.name,p.brand,v.size,v.color,(${distance})::text distance_km,s.delivery_radius_km::text,s.latitude::text store_latitude,s.longitude::text store_longitude,a.latitude::text customer_latitude,a.longitude::text customer_longitude,s.preparation_time_minutes,(i.selling_price*ci.quantity)::text line_subtotal,SUM(i.selling_price*ci.quantity)OVER(PARTITION BY ci.store_id)::text store_subtotal,SUM(i.selling_price*ci.quantity)OVER()::text subtotal FROM cart_items ci JOIN store_inventory i ON i.store_id=ci.store_id AND i.variant_id=ci.variant_id JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=ci.store_id CROSS JOIN customer_addresses a WHERE ci.cart_id=$1 AND a.id=$2 ORDER BY ci.store_id,ci.variant_id`,
      [cartId, addressId],
    )
  ).rows;
}
export function issuesFor(data: CheckoutRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const row of data) {
    const ids = {
      itemId: row.item_id,
      storeId: row.store_id,
      variantId: row.variant_id,
    };
    if (!row.variant_active)
      issues.push({
        code: "VARIANT_INACTIVE",
        message: `${row.sku} is inactive`,
        ...ids,
      });
    if (!row.store_active)
      issues.push({
        code: "STORE_INACTIVE",
        message: `${row.store_name} is inactive`,
        ...ids,
      });
    else if (Number(row.distance_km) > Number(row.delivery_radius_km))
      issues.push({
        code: "STORE_NOT_SERVICEABLE",
        message: `${row.store_name} cannot serve this address`,
        ...ids,
      });
    if (!row.inventory_available || row.stock_quantity < row.quantity)
      issues.push({
        code: "INSUFFICIENT_INVENTORY",
        message: `Only ${Math.max(0, row.stock_quantity)} units are available`,
        ...ids,
      });
    if (row.price_snapshot !== row.current_price)
      issues.push({
        code: "PRICE_CHANGED",
        message: `Price changed from ${row.price_snapshot} to ${row.current_price}`,
        ...ids,
      });
  }
  return issues;
}
export async function checkoutResponse(data: CheckoutRow[], issues: ValidationIssue[]) {
  const groups = await Promise.all([...new Set(data.map((row) => row.store_id))].map(
    async (storeId) => {
      const selected = data.filter((row) => row.store_id === storeId);
      const calculatedEstimate = await calculateHybridEta({ storeLatitude: Number(selected[0]!.store_latitude), storeLongitude: Number(selected[0]!.store_longitude), customerLatitude: Number(selected[0]!.customer_latitude), customerLongitude: Number(selected[0]!.customer_longitude), preparationMinutes: selected[0]!.preparation_time_minutes });
      const estimate = calculatedEstimate && isEtaFresh(calculatedEstimate) ? calculatedEstimate : null;
      return {
        store: {
          id: storeId,
          name: selected[0]!.store_name,
          distanceKm: Number(Number(selected[0]!.distance_km).toFixed(2)),
          serviceable:
            selected[0]!.store_active &&
            Number(selected[0]!.distance_km) <=
              Number(selected[0]!.delivery_radius_km),
        },
        eta: estimate,
        items: selected.map((row) => ({
          itemId: row.item_id,
          variantId: row.variant_id,
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          size: row.size,
          color: row.color,
          quantity: row.quantity,
          unitPrice: row.current_price,
          lineSubtotal: row.line_subtotal,
        })),
        itemCount: selected.reduce((sum, row) => sum + row.quantity, 0),
        subtotal: selected[0]!.store_subtotal,
      };
    },
  ));
  const activeEstimates = groups.map((group) => ({
    storeId: group.store.id,
    estimate: group.eta,
    active: group.store.serviceable && !issues.some((issue) => issue.storeId === group.store.id),
  }));
  return {
    valid: issues.length === 0,
    groups,
    subtotal: data[0]?.subtotal ?? "0.00",
    deliveryFee: null,
    total: data[0]?.subtotal ?? "0.00",
    currency: "INR",
    issues,
    eta: overallEta(activeEstimates),
  };
}
export async function validateCheckout(sessionId: string, addressId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ownedAddress(client, sessionId, addressId);
    const cartId = await activeCart(client, sessionId);
    const data = await checkoutRows(client, cartId, addressId);
    if (!data.length)
      throw new CommerceError("CART_EMPTY", "Cart is empty", 409);
    await client.query("COMMIT");
    return await checkoutResponse(data, issuesFor(data));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function requestHash(cartId: string, addressId: string, data: CheckoutRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cartId,
        addressId,
        items: data.map((row) => [row.store_id, row.variant_id, row.quantity]),
      }),
    )
    .digest("hex");
}
async function reservationResult(client: PoolClient, id: string) {
  const header = (
    await client.query(
      `SELECT r.id::text,r.status,r.expires_at AS "expiresAt",a.subtotal::text,a.delivery_fee::text AS "deliveryFee",a.total_amount::text AS total,a.currency FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id WHERE r.id=$1`,
      [id],
    )
  ).rows[0];
  const items = (
    await client.query(
      `SELECT store_id::text AS "storeId",variant_id::text AS "variantId",quantity,unit_price::text AS "unitPrice" FROM inventory_reservation_items WHERE reservation_id=$1 ORDER BY store_id,variant_id`,
      [id],
    )
  ).rows;
  const estimates = await reservationEstimates(client, id);
  return { ...header, items, eta: estimates.find((estimate: { scope: string }) => estimate.scope === "overall") ?? null, storeEtas: estimates.filter((estimate: { scope: string }) => estimate.scope === "store") };
}
export async function reserve(
  sessionId: string,
  addressId: string,
  idempotencyKey: string,
  ttlMinutes: number,
  transactionClient?: PoolClient,
) {
  const client = transactionClient ?? await pool.connect();
  const ownsTransaction = !transactionClient;
  try {
    if (ownsTransaction) await client.query("BEGIN");
    await ownedAddress(client, sessionId, addressId);
    const cartId = await activeCart(client, sessionId, true);
    await client.query(
      `SELECT i.id FROM cart_items ci JOIN store_inventory i ON i.store_id=ci.store_id AND i.variant_id=ci.variant_id WHERE ci.cart_id=$1 ORDER BY ci.store_id,ci.variant_id FOR UPDATE OF i`,
      [cartId],
    );
    const data = await checkoutRows(client, cartId, addressId);
    if (!data.length)
      throw new CommerceError("CART_EMPTY", "Cart is empty", 409);
    const hash = requestHash(cartId, addressId, data);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO checkout_attempts(cart_id,session_id,address_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,idempotency_key) DO NOTHING RETURNING id::text`,
      [cartId, sessionId, addressId, idempotencyKey, hash],
    );
    let attemptId = inserted.rows[0]?.id;
    if (!attemptId) {
      const existing = (
        await client.query<{
          id: string;
          request_hash: string;
          status: string;
        }>(
          `SELECT id::text,request_hash,status FROM checkout_attempts WHERE session_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [sessionId, idempotencyKey],
        )
      ).rows[0]!;
      if (existing.request_hash !== hash)
        throw new CommerceError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was used for a different request",
          409,
        );
      attemptId = existing.id;
      if (existing.status === "reserved" || existing.status === "completed") {
        const reservation = (
          await client.query<{ id: string }>(
            `SELECT id::text FROM inventory_reservations WHERE checkout_attempt_id=$1`,
            [attemptId],
          )
        ).rows[0]!;
        const result = await reservationResult(client, reservation.id);
        if (ownsTransaction) await client.query("COMMIT");
        return { created: false, data: result };
      }
      throw new CommerceError(
        "RESERVATION_FAILED",
        `This checkout attempt is ${existing.status}`,
        409,
      );
    }
    const issues = issuesFor(data);
    if (issues.length) {
      await client.query(
        `UPDATE checkout_attempts SET status='failed',failure_issues=$2::jsonb,updated_at=NOW() WHERE id=$1`,
        [attemptId, JSON.stringify(issues)],
      );
      if (ownsTransaction) await client.query("COMMIT");
      return { created: true, validation: await checkoutResponse(data, issues) };
    }
    const checkoutEstimate = await checkoutResponse(data, []);
    await insertSnapshots(client, "checkout", { checkoutAttemptId: attemptId }, checkoutEstimate.groups.map((group) => ({ storeId: group.store.id, eta: group.eta })), checkoutEstimate.eta);
    for (const row of data) {
      const updated = await client.query(
        `UPDATE store_inventory SET stock_quantity=stock_quantity-$3,updated_at=NOW() WHERE store_id=$1 AND variant_id=$2 AND is_available AND stock_quantity>=$3 RETURNING id`,
        [row.store_id, row.variant_id, row.quantity],
      );
      if (updated.rowCount !== 1)
        throw new CommerceError(
          "INVENTORY_CONFLICT",
          "Inventory changed during reservation",
          409,
        );
    }
    const expires = (
      await client.query<{ expires_at: Date }>(
        `SELECT NOW()+($1::text||' minutes')::interval expires_at`,
        [ttlMinutes],
      )
    ).rows[0]!.expires_at;
    const reservation = (
      await client.query<{ id: string }>(
        `INSERT INTO inventory_reservations(checkout_attempt_id,expires_at) VALUES($1,$2) RETURNING id::text`,
        [attemptId, expires],
      )
    ).rows[0]!;
    const reservationEstimate = await checkoutResponse(data, []);
    await insertSnapshots(client, "reservation", { checkoutAttemptId: attemptId, reservationId: reservation.id }, reservationEstimate.groups.map((group) => ({ storeId: group.store.id, eta: group.eta })), reservationEstimate.eta);
    for (const row of data)
      await client.query(
        `INSERT INTO inventory_reservation_items(reservation_id,store_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)`,
        [
          reservation.id,
          row.store_id,
          row.variant_id,
          row.quantity,
          row.current_price,
        ],
      );
    await client.query(
      `UPDATE checkout_attempts SET status='reserved',subtotal=$2,total_amount=$2,expires_at=$3,updated_at=NOW() WHERE id=$1`,
      [attemptId, data[0]!.subtotal, expires],
    );
    const result = await reservationResult(client, reservation.id);
    if (ownsTransaction) await client.query("COMMIT");
    return { created: true, data: result };
  } catch (error) {
    if (ownsTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export async function placeOrder(
  sessionId: string,
  addressId: string,
  idempotencyKey: string,
  ttlMinutes: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingOrder = (await client.query<{ reservation_id: string; address_id: string }>("SELECT reservation_id::text,address_id::text FROM customer_orders WHERE session_id=$1 AND idempotency_key=$2 FOR UPDATE", [sessionId, idempotencyKey])).rows[0];
    if (existingOrder) {
      if (existingOrder.address_id !== addressId) throw new CommerceError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request", 409);
      const existing = await createFromReservation(sessionId, existingOrder.reservation_id, idempotencyKey, client);
      await client.query("COMMIT");
      return existing;
    }
    const allocation = await reserve(sessionId, addressId, idempotencyKey, ttlMinutes, client);
    if ("validation" in allocation) {
      await client.query("ROLLBACK");
      return { created: false, validation: allocation.validation };
    }
    const order = await createFromReservation(sessionId, allocation.data.id, idempotencyKey, client);
    await client.query("COMMIT");
    if (order.created && order.data) publishDeliveryEvent("order:created", { orderId: order.data.id, status: order.data.status });
    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function getReservation(sessionId: string, id: string) {
  const client = await pool.connect();
  try {
    const owned = (
      await client.query(
        `SELECT r.id FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id WHERE r.id=$1 AND a.session_id=$2`,
        [id, sessionId],
      )
    ).rows[0];
    return owned ? reservationResult(client, id) : null;
  } finally {
    client.release();
  }
}
async function restore(
  client: PoolClient,
  reservationId: string,
  status: "released" | "expired",
) {
  const changed = await client.query(
    `UPDATE inventory_reservations SET status=$2,updated_at=NOW() WHERE id=$1 AND status='active' RETURNING checkout_attempt_id`,
    [reservationId, status],
  );
  if (!changed.rowCount) return false;
  await client.query(
    `SELECT i.id FROM inventory_reservation_items ri JOIN store_inventory i ON i.store_id=ri.store_id AND i.variant_id=ri.variant_id WHERE ri.reservation_id=$1 ORDER BY ri.store_id,ri.variant_id FOR UPDATE OF i`,
    [reservationId],
  );
  await client.query(
    `UPDATE store_inventory i SET stock_quantity=i.stock_quantity+ri.quantity,updated_at=NOW() FROM inventory_reservation_items ri WHERE ri.reservation_id=$1 AND i.store_id=ri.store_id AND i.variant_id=ri.variant_id`,
    [reservationId],
  );
  await client.query(
    `UPDATE checkout_attempts SET status=$2,updated_at=NOW() WHERE id=$1`,
    [
      changed.rows[0].checkout_attempt_id,
      status === "expired" ? "expired" : "failed",
    ],
  );
  return true;
}
export async function releaseReservation(sessionId: string, id: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = (
      await client.query<{ id: string; status: string }>(
        `SELECT r.id::text,r.status FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id WHERE r.id=$1 AND a.session_id=$2 FOR UPDATE OF r`,
        [id, sessionId],
      )
    ).rows[0];
    if (!owned)
      throw new CommerceError("NOT_FOUND", "Reservation not found", 404);
    if (owned.status !== "active")
      throw new CommerceError(
        "INVALID_RESERVATION_STATE",
        `Reservation is already ${owned.status}`,
        409,
      );
    await restore(client, id, "released");
    const result = await reservationResult(client, id);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function expireReservations(limit = 50) {
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query("BEGIN");
    const expired = await client.query<{ id: string }>(
      `SELECT id::text FROM inventory_reservations WHERE status='active' AND expires_at<=NOW() ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT $1`,
      [limit],
    );
    for (const row of expired.rows)
      if (await restore(client, row.id, "expired")) count++;
    await client.query("COMMIT");
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
