import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { CommerceError } from "../utils/commerce-error.js";
import type { RejectionReasonCode, StoreOrderStatus } from "../types/order.types.js";
import { ensureTask } from "./delivery.model.js";
import { deriveParentOrderStatus } from "../services/order-status.service.js";
import { copyReservationToOrder, orderEstimate } from "./eta.model.js";
import { env } from "../config/env.js";
import { publishDeliveryEvent } from "../realtime.js";

const CUSTOMER_STATUSES = ["placed", "partially_accepted", "confirmed", "partially_rejected", "rejected", "cancelled", "completed"] as const;

function orderNumber() { return `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function storeOrderNumber() { return `STORE-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function hashRequest(reservationId: string) { return createHash("sha256").update(reservationId).digest("hex"); }

async function orderPayload(client: PoolClient, orderId: string) {
  const header = (await client.query(`SELECT id::text,order_number AS "orderNumber",status,subtotal::text,total_amount::text AS total,currency,address_snapshot AS "addressSnapshot",created_at AS "createdAt",updated_at AS "updatedAt" FROM customer_orders WHERE id=$1`, [orderId])).rows[0];
  if (!header) return null;
  const stores = (await client.query(`SELECT so.id::text,so.store_order_number AS "storeOrderNumber",so.store_id::text AS "storeId",s.name AS "storeName",so.status,so.subtotal::text,so.rejection_reason_code AS "rejectionReasonCode",so.rejection_note AS "rejectionNote",so.accepted_at AS "acceptedAt",so.rejected_at AS "rejectedAt",so.preparation_started_at AS "preparationStartedAt",so.ready_at AS "readyAt" FROM store_orders so JOIN stores s ON s.id=so.store_id WHERE so.customer_order_id=$1 ORDER BY so.id`, [orderId])).rows;
  const items = (await client.query(`SELECT oi.id::text,so.id::text AS "storeOrderId",oi.product_id::text AS "productId",oi.variant_id::text AS "variantId",oi.inventory_id::text AS "inventoryId",oi.sku,oi.product_name AS "productName",oi.brand,oi.image_url AS "imageUrl",oi.variant_attributes AS "variantAttributes",oi.unit_price::text AS "unitPrice",oi.quantity,oi.line_total::text AS "lineTotal" FROM order_items oi JOIN store_orders so ON so.id=oi.store_order_id WHERE so.customer_order_id=$1 ORDER BY oi.id`, [orderId])).rows;
  const etaRows = (await client.query(`SELECT so.id::text AS "storeOrderId", es.store_id::text AS "storeId", es.stage, es.scope, es.eta_minutes AS "etaMinutes",es.min_eta_minutes AS "minEtaMinutes",es.max_eta_minutes AS "maxEtaMinutes",es.estimated_delivery_at AS "estimatedDeliveryAt",es.latest_estimated_delivery_at AS "latestEstimatedDeliveryAt",es.calculated_at AS "calculatedAt",es.valid_until AS "validUntil",es.eta_source AS "etaSource",es.algorithm_version AS "algorithmVersion" FROM eta_snapshots es LEFT JOIN store_orders so ON so.id=es.store_order_id WHERE es.customer_order_id=$1 OR es.reservation_id=(SELECT reservation_id FROM customer_orders WHERE id=$1) ORDER BY es.stage,es.scope,es.store_id`, [orderId])).rows;
  const overall = etaRows.find((eta: { scope: string; stage: string }) => eta.scope === "overall" && eta.stage === "order") ?? null;
  return { ...header, eta: overall, storeOrders: stores.map((store: Record<string, unknown>) => ({ ...store, eta: etaRows.find((eta: { storeOrderId?: string; stage: string }) => eta.stage === "order" && eta.storeOrderId === store.id) ?? null, checkoutEta: etaRows.find((eta: { storeId?: string; stage: string; scope: string }) => eta.stage === "checkout" && eta.scope === "store" && eta.storeId === store.storeId) ?? null, reservationEta: etaRows.find((eta: { storeId?: string; stage: string; scope: string }) => eta.stage === "reservation" && eta.scope === "store" && eta.storeId === store.storeId) ?? null, items: items.filter((item: Record<string, unknown>) => item.storeOrderId === store.id) })) };
}

export async function createFromReservation(sessionId: string, reservationId: string, idempotencyKey: string, transactionClient?: PoolClient) {
  const client = transactionClient ?? await pool.connect();
  const ownsTransaction = !transactionClient;
  try {
    if (ownsTransaction) await client.query("BEGIN");
    const existing = (await client.query<{ id: string; request_hash: string }>(`SELECT id::text,request_hash FROM customer_orders WHERE session_id=$1 AND idempotency_key=$2 FOR UPDATE`, [sessionId, idempotencyKey])).rows[0];
    const requestHash = hashRequest(reservationId);
    if (existing) {
      if (existing.request_hash !== requestHash) throw new CommerceError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different order", 409);
      const result = await orderPayload(client, existing.id);
      if (ownsTransaction) await client.query("COMMIT");
      return { created: false, data: result };
    }
    const reservation = (await client.query(`SELECT r.id::text,r.status,r.expires_at,a.session_id,a.address_id::text,a.subtotal::text,a.total_amount::text,a.currency,ca.label,ca.recipient_name,ca.phone,ca.address_line1,ca.address_line2,ca.city,ca.state,ca.postal_code,ca.latitude::text,ca.longitude::text FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id JOIN customer_addresses ca ON ca.id=a.address_id WHERE r.id=$1 AND a.session_id=$2 FOR UPDATE`, [reservationId, sessionId])).rows[0];
    if (!reservation) throw new CommerceError("RESERVATION_NOT_FOUND", "Reservation not found", 404);
    if (reservation.status !== "active") {
      if (reservation.status === "consumed") throw new CommerceError("RESERVATION_CONSUMED", "Reservation has already been converted to an order", 409);
      throw new CommerceError("RESERVATION_NOT_ACTIVE", "Reservation is no longer active", 409);
    }
    if (new Date(reservation.expires_at).getTime() <= Date.now()) throw new CommerceError("RESERVATION_EXPIRED", "Reservation has expired", 409);
    const lines = (await client.query(`SELECT ri.store_id::text,ri.variant_id::text,ri.quantity,ri.unit_price::text,i.id::text AS inventory_id,p.id::text AS product_id,p.name,p.brand,p.image_url,v.sku,v.attributes,v.gender,v.size,v.size_system,v.color,v.material,v.fit,v.style,s.name AS store_name FROM inventory_reservation_items ri JOIN store_inventory i ON i.store_id=ri.store_id AND i.variant_id=ri.variant_id JOIN product_variants v ON v.id=ri.variant_id JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=ri.store_id WHERE ri.reservation_id=$1 ORDER BY ri.store_id,ri.variant_id FOR UPDATE OF i`, [reservationId])).rows;
    if (!lines.length) throw new CommerceError("RESERVATION_EMPTY", "Reservation contains no items", 409);
    const order = (await client.query(`INSERT INTO customer_orders(order_number,session_id,idempotency_key,request_hash,reservation_id,address_id,address_snapshot,status,subtotal,total_amount,currency) VALUES($1,$2,$3,$4,$5,$6,$7,'placed',$8,$9,$10) RETURNING id::text`, [orderNumber(),sessionId,idempotencyKey,requestHash,reservationId,reservation.address_id,JSON.stringify({id:reservation.address_id,label:reservation.label,recipientName:reservation.recipient_name,phone:reservation.phone,addressLine1:reservation.address_line1,addressLine2:reservation.address_line2,city:reservation.city,state:reservation.state,postalCode:reservation.postal_code,latitude:Number(reservation.latitude),longitude:Number(reservation.longitude)}),reservation.subtotal,reservation.total_amount,reservation.currency])).rows[0]!;
    const storeIds = [...new Set(lines.map((line: {store_id:string}) => line.store_id))];
    const storeOrderByStore = new Map<string, string>();
    for (const storeId of storeIds) {
      const storeLines = lines.filter((line: {store_id:string}) => line.store_id === storeId);
      const subtotal = (await client.query<{ total: string }>(`SELECT SUM(unit_price * quantity)::text AS total FROM inventory_reservation_items WHERE reservation_id=$1 AND store_id=$2`, [reservationId, storeId])).rows[0]!.total;
      const storeOrder = (await client.query(`INSERT INTO store_orders(customer_order_id,store_id,store_order_number,subtotal) VALUES($1,$2,$3,$4) RETURNING id::text`, [order.id,storeId,storeOrderNumber(),subtotal])).rows[0]!;
      storeOrderByStore.set(storeId, storeOrder.id);
      for (const line of storeLines) {
        const attrs = { ...(line.attributes ?? {}), gender: line.gender, size: line.size, sizeSystem: line.size_system, color: line.color, material: line.material, fit: line.fit, style: line.style };
        await client.query(`INSERT INTO order_items(store_order_id,product_id,variant_id,inventory_id,sku,product_name,brand,image_url,variant_attributes,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::numeric,$11::integer,($10::numeric*$11::integer))`, [storeOrder.id,line.product_id,line.variant_id,line.inventory_id,line.sku,line.name,line.brand,line.image_url,JSON.stringify(attrs),line.unit_price,line.quantity]);
      }
      await client.query(`INSERT INTO store_order_status_history(store_order_id,to_status,note) VALUES($1,'pending_acceptance','Order created')`, [storeOrder.id]);
      if (env.DEMO_AUTO_ACCEPT_STORE_ORDERS) {
        await client.query(`UPDATE store_orders SET status='accepted',accepted_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='pending_acceptance'`, [storeOrder.id]);
        await client.query(`INSERT INTO store_order_status_history(store_order_id,from_status,to_status,note) VALUES($1,'pending_acceptance','accepted','Demo auto-accepted')`, [storeOrder.id]);
      }
    }
    await copyReservationToOrder(client, reservationId, order.id, storeOrderByStore);
    await client.query(`INSERT INTO order_status_history(customer_order_id,to_status,note) VALUES($1,'placed','Order created from reservation')`, [order.id]);
    if (env.DEMO_AUTO_ACCEPT_STORE_ORDERS) {
      const derived = await deriveParentOrderStatus(client, order.id);
      if (derived !== "placed") {
        await client.query(`UPDATE customer_orders SET status=$2,updated_at=NOW() WHERE id=$1`, [order.id, derived]);
        await client.query(`INSERT INTO order_status_history(customer_order_id,from_status,to_status,note) VALUES($1,'placed',$2,'Demo auto-accepted store orders')`, [order.id, derived]);
      }
    }
    await client.query(`UPDATE inventory_reservations SET status='consumed',updated_at=NOW() WHERE id=$1 AND status='active'`, [reservationId]);
    await client.query(`UPDATE checkout_attempts SET status='completed',updated_at=NOW() WHERE id=(SELECT checkout_attempt_id FROM inventory_reservations WHERE id=$1)`, [reservationId]);
    // Remove only the exact variant/store lines represented by this consumed
    // reservation. This keeps unrelated cart items intact and remains inside
    // the order transaction, so failed order creation leaves the cart alone.
    await client.query(`
      DELETE FROM cart_items ci
      USING carts c, inventory_reservation_items ri
      WHERE ci.cart_id = c.id
        AND c.session_id = $1
        AND ri.reservation_id = $2
        AND ci.store_id = ri.store_id
        AND ci.variant_id = ri.variant_id
    `, [sessionId, reservationId]);
    const result = await orderPayload(client, order.id);
    if (ownsTransaction) await client.query("COMMIT");
    return { created: true, data: result };
  } catch (error) { if (ownsTransaction) await client.query("ROLLBACK"); throw error; }
  finally { if (ownsTransaction) client.release(); }
}

export async function listCustomerOrders(sessionId: string, limit = 20, cursor?: string) {
  const values: unknown[] = [sessionId, limit + 1];
  const cursorClause = cursor ? (values.push(cursor), `AND o.id < $${values.length}::bigint`) : "";
  const rows = (await pool.query(`SELECT o.id::text,o.order_number AS "orderNumber",o.status,o.subtotal::text,o.total_amount::text AS total,o.currency,o.created_at AS "createdAt",tracking.status AS "trackingStatus" FROM customer_orders o LEFT JOIN LATERAL (SELECT dt.status FROM delivery_tasks dt WHERE dt.customer_order_id=o.id AND dt.status NOT IN ('delivered','cancelled','delivery_failed') ORDER BY dt.updated_at DESC,dt.id DESC LIMIT 1) tracking ON TRUE WHERE o.session_id=$1 ${cursorClause} ORDER BY o.id DESC LIMIT $2`, values)).rows;
  const hasNextPage = rows.length > limit;
  const data = rows.slice(0, limit);
  return { data, pagination: { limit, hasNextPage, nextCursor: hasNextPage ? data.at(-1)!.id : null } };
}

export async function getCustomerOrder(sessionId: string, id: string) {
  const client = await pool.connect();
  try {
    const owned = (await client.query<{ id: string }>(`SELECT id::text FROM customer_orders WHERE id=$1 AND session_id=$2`, [id,sessionId])).rows[0];
    return owned ? orderPayload(client, id) : null;
  } finally { client.release(); }
}

export async function getOrderHistory(sessionId: string, id: string) {
  const result = await pool.query(`SELECT h.id::text,h.from_status AS "fromStatus",h.to_status AS "toStatus",h.note,h.created_at AS "createdAt" FROM order_status_history h JOIN customer_orders o ON o.id=h.customer_order_id WHERE h.customer_order_id=$1 AND o.session_id=$2 ORDER BY h.created_at,h.id`, [id,sessionId]);
  return result.rows;
}

async function authorizedStoreOrder(client: PoolClient, operatorKey: string, id: string, lock = false) {
  const row = (await client.query(`SELECT so.id::text,so.customer_order_id::text,so.store_id::text,so.status,so.subtotal::text,so.rejection_reason_code AS "rejectionReasonCode",so.rejection_note AS "rejectionNote" FROM store_orders so JOIN store_operators op ON op.store_id=so.store_id AND op.operator_key=$1 AND op.is_active WHERE so.id=$2 ${lock ? "FOR UPDATE OF so" : ""}`, [operatorKey,id])).rows[0];
  if (!row) throw new CommerceError("STORE_ORDER_NOT_FOUND", "Store order not found", 404);
  return row;
}

async function authorizedStore(client: PoolClient, operatorKey: string) {
  const row = (await client.query<{ id: string; storeCode: string; storeName: string }>(`SELECT s.id::text,s.store_code AS "storeCode",s.name AS "storeName" FROM store_operators op JOIN stores s ON s.id=op.store_id WHERE op.operator_key=$1 AND op.is_active`, [operatorKey])).rows[0];
  if (!row) throw new CommerceError("STORE_OPERATOR_FORBIDDEN", "The store operator identity is not active or is not recognized", 403);
  return row;
}

export async function listStoreOrders(operatorKey: string, limit = 50) {
  const client = await pool.connect();
  try {
    const store = await authorizedStore(client, operatorKey);
    const result = await client.query(`SELECT so.id::text,so.store_order_number AS "storeOrderNumber",so.customer_order_id::text AS "customerOrderId",o.order_number AS "orderNumber",so.store_id::text AS "storeId",s.name AS "storeName",so.status,so.subtotal::text,so.created_at AS "createdAt" FROM store_orders so JOIN customer_orders o ON o.id=so.customer_order_id JOIN stores s ON s.id=so.store_id WHERE so.store_id=$1 ORDER BY so.created_at DESC,so.id DESC LIMIT $2`, [store.id,limit]);
    return { data: result.rows, store };
  } finally { client.release(); }
}

export async function getStoreOrder(operatorKey: string, id: string) {
  const client = await pool.connect();
  try {
    const row = await authorizedStoreOrder(client, operatorKey, id);
    const detail = await orderPayload(client, row.customer_order_id);
    const store = detail?.storeOrders.find((item: {id:string}) => item.id === id);
    return store ? { ...store, orderNumber: detail.orderNumber, customerOrderId: detail.id, customerAddressSnapshot: detail.addressSnapshot } : null;
  } finally { client.release(); }
}

export async function getStoreOrderHistory(operatorKey: string, id: string) {
  const client = await pool.connect();
  try {
    await authorizedStoreOrder(client, operatorKey, id);
    const result = await client.query(`SELECT h.id::text,h.from_status AS "fromStatus",h.to_status AS "toStatus",h.note,h.created_at AS "createdAt" FROM store_order_status_history h WHERE h.store_order_id=$1 ORDER BY h.created_at,h.id`, [id]);
    return result.rows;
  } finally { client.release(); }
}

export async function transitionStoreOrder(operatorKey: string, id: string, action: "accept" | "prepare" | "ready", note = "") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await authorizedStoreOrder(client, operatorKey, id, true);
    const expected: Record<string, StoreOrderStatus> = { accept: "pending_acceptance", prepare: "accepted", ready: "preparing" };
    const next: Record<string, StoreOrderStatus> = { accept: "accepted", prepare: "preparing", ready: "ready_for_pickup" };
    if (row.status !== expected[action]) throw new CommerceError("INVALID_STORE_ORDER_TRANSITION", `Cannot ${action} a ${row.status} store order`, 409);
    const timestamp = action === "accept" ? "accepted_at" : action === "prepare" ? "preparation_started_at" : "ready_at";
    await client.query(`UPDATE store_orders SET status=$2,${timestamp}=NOW(),updated_at=NOW() WHERE id=$1`, [id,next[action]]);
    if (action === "ready") await ensureTask(client, id);
    await client.query(`INSERT INTO store_order_status_history(store_order_id,from_status,to_status,note) VALUES($1,$2,$3,$4)`, [id,row.status,next[action],note]);
    const parentStatus = await deriveParentOrderStatus(client,row.customer_order_id);
    const previous = (await client.query(`SELECT status FROM customer_orders WHERE id=$1`, [row.customer_order_id])).rows[0]?.status;
    if (previous !== parentStatus) await client.query(`INSERT INTO order_status_history(customer_order_id,from_status,to_status,note) VALUES($1,$2,$3,$4)`, [row.customer_order_id,previous,parentStatus,`Store order ${next[action]}`]);
    const result = await orderPayload(client,row.customer_order_id);
    await client.query("COMMIT");
    publishDeliveryEvent("order:store_status_updated", { orderId: row.customer_order_id, storeOrderId: id, status: next[action], parentStatus });
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function rejectStoreOrder(operatorKey: string, id: string, reason: RejectionReasonCode, note: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await authorizedStoreOrder(client, operatorKey, id, true);
    if (row.status !== "pending_acceptance") throw new CommerceError("INVALID_STORE_ORDER_TRANSITION", `Cannot reject a ${row.status} store order`, 409);
    const items = (await client.query(`SELECT oi.id::text,oi.inventory_id::text,oi.quantity FROM order_items oi WHERE oi.store_order_id=$1 ORDER BY oi.inventory_id::bigint FOR UPDATE`, [id])).rows;
    for (const item of items) {
      const inv = (await client.query(`SELECT id FROM store_inventory WHERE id=$1 FOR UPDATE`, [item.inventory_id])).rows[0];
      if (!inv) throw new CommerceError("INVENTORY_NOT_FOUND", "Original inventory row no longer exists", 409);
      const inserted = await client.query(`INSERT INTO order_inventory_adjustments(order_item_id,inventory_id,adjustment_type,quantity) VALUES($1,$2,'REJECTION_RESTORE',$3) ON CONFLICT(order_item_id,adjustment_type) DO NOTHING RETURNING id`, [item.id,item.inventory_id,item.quantity]);
      if (inserted.rowCount) await client.query(`UPDATE store_inventory SET stock_quantity=stock_quantity+$2,is_available=TRUE,updated_at=NOW() WHERE id=$1`, [item.inventory_id,item.quantity]);
    }
    await client.query(`UPDATE store_orders SET status='rejected',rejection_reason_code=$2,rejection_note=$3,rejected_at=NOW(),updated_at=NOW() WHERE id=$1`, [id,reason,note]);
    await client.query(`INSERT INTO store_order_status_history(store_order_id,from_status,to_status,note) VALUES($1,'pending_acceptance','rejected',$2)`, [id,note || reason]);
    const parentStatus = await deriveParentOrderStatus(client,row.customer_order_id);
    const previous = (await client.query(`SELECT status FROM customer_orders WHERE id=$1`, [row.customer_order_id])).rows[0]?.status;
    if (previous !== parentStatus) await client.query(`INSERT INTO order_status_history(customer_order_id,from_status,to_status,note) VALUES($1,$2,$3,$4)`, [row.customer_order_id,previous,parentStatus,`Store order rejected: ${reason}`]);
    const result = await orderPayload(client,row.customer_order_id);
    await client.query("COMMIT");
    publishDeliveryEvent("order:store_status_updated", { orderId: row.customer_order_id, storeOrderId: id, status: "rejected", parentStatus });
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function cancelCustomerOrder(sessionId: string, id: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = (await client.query<{ id: string; status: string }>("SELECT id::text,status FROM customer_orders WHERE id=$1 AND session_id=$2 FOR UPDATE", [id, sessionId])).rows[0];
    if (!order) throw new CommerceError("ORDER_NOT_FOUND", "Order not found", 404);
    if (["completed", "cancelled", "rejected"].includes(order.status)) throw new CommerceError("CANCELLATION_NOT_AVAILABLE", "This order can no longer be cancelled", 409);
    const stores = (await client.query<{ id: string; status: StoreOrderStatus }>("SELECT id::text,status FROM store_orders WHERE customer_order_id=$1 ORDER BY id FOR UPDATE", [id])).rows;
    const cancelled: string[] = [];
    for (const store of stores) {
      if (!["pending_acceptance", "accepted", "preparing", "ready_for_pickup"].includes(store.status)) continue;
      const task = (await client.query<{ id: string; status: string; assignment_id: string | null; agent_id: string | null }>(`SELECT dt.id::text,dt.status,a.id::text assignment_id,a.agent_id::text FROM delivery_tasks dt LEFT JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' WHERE dt.store_order_id=$1 FOR UPDATE OF dt`, [store.id])).rows[0];
      if (task && ["picked_up", "out_for_delivery", "delivered"].includes(task.status)) continue;
      if (task) {
        await client.query("UPDATE delivery_tasks SET status='cancelled',updated_at=NOW() WHERE id=$1 AND status NOT IN ('cancelled','delivered')", [task.id]);
        if (task.assignment_id) await client.query("UPDATE delivery_assignments SET status='closed',closed_at=NOW() WHERE id=$1 AND status='active'", [task.assignment_id]);
        if (task.agent_id) await client.query("UPDATE delivery_agents SET availability='available',updated_at=NOW() WHERE id=$1", [task.agent_id]);
        await client.query("INSERT INTO delivery_status_history(delivery_task_id,from_status,to_status,actor_type,note) VALUES($1,$2,'cancelled','system','Cancelled by customer before pickup')", [task.id, task.status]);
      }
      const items = (await client.query<{ id: string; inventory_id: string; quantity: number }>("SELECT id::text,inventory_id::text,quantity FROM order_items WHERE store_order_id=$1 ORDER BY inventory_id FOR UPDATE", [store.id])).rows;
      for (const item of items) {
        const inserted = await client.query("INSERT INTO order_inventory_adjustments(order_item_id,inventory_id,adjustment_type,quantity) VALUES($1,$2,'CANCELLATION_RESTORE',$3) ON CONFLICT(order_item_id,adjustment_type) DO NOTHING RETURNING id", [item.id, item.inventory_id, item.quantity]);
        if (inserted.rowCount) await client.query("UPDATE store_inventory SET stock_quantity=stock_quantity+$2,is_available=TRUE,updated_at=NOW() WHERE id=$1", [item.inventory_id, item.quantity]);
      }
      await client.query("UPDATE store_orders SET status='cancelled',updated_at=NOW() WHERE id=$1", [store.id]);
      await client.query("INSERT INTO store_order_status_history(store_order_id,from_status,to_status,note) VALUES($1,$2,'cancelled','Cancelled by customer before pickup')", [store.id, store.status]);
      cancelled.push(store.id);
    }
    if (!cancelled.length) throw new CommerceError("CANCELLATION_NOT_AVAILABLE", "This order is already being delivered or completed", 409);
    const parentStatus = await deriveParentOrderStatus(client, id);
    if (parentStatus !== order.status) await client.query("INSERT INTO order_status_history(customer_order_id,from_status,to_status,note) VALUES($1,$2,$3,'Cancelled by customer')", [id, order.status, parentStatus]);
    const result = await orderPayload(client, id);
    await client.query("COMMIT");
    for (const storeOrderId of cancelled) publishDeliveryEvent("order:store_status_updated", { orderId: id, storeOrderId, status: "cancelled", parentStatus });
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
