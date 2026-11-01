import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const session = (name: string) => `phase4_session_${name.padEnd(16, "x")}`;
const headers = (name: string) => ({ "X-Cart-Session": session(name) });
let variantA = "", variantB = "", storeA = "", storeB = "";

async function createAddress(name: string) {
  const response = await request(app).post("/api/addresses").set(headers(name)).send({
    label: "Home", recipientName: "Order Customer", phone: "9876543210", addressLine1: "Demo address", addressLine2: "",
    city: "Hyderabad", state: "Telangana", postalCode: "500032", latitude: 17.4401, longitude: 78.3489, isDefault: true,
  });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function reserveCart(name: string, addressId: string, secondStore = false) {
  await request(app).post("/api/cart/items").set(headers(name)).send({ variantId: variantA, storeId: storeA, quantity: 1 });
  if (secondStore) await request(app).post("/api/cart/items").set(headers(name)).send({ variantId: variantB, storeId: storeB, quantity: 1 });
  const response = await request(app).post("/api/checkout/reservations").set(headers(name)).set("Idempotency-Key", `reserve_${name}`).send({ addressId });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

beforeEach(async () => {
  await pool.query("TRUNCATE delivery_status_history,delivery_assignments,delivery_tasks,delivery_agents,delivery_dispatchers,order_inventory_adjustments,order_items,store_order_status_history,order_status_history,store_orders,customer_orders,store_operators,inventory_reservation_items,inventory_reservations,checkout_attempts,cart_items,carts,customer_addresses RESTART IDENTITY CASCADE");
  const rows = await pool.query<{ variant_id: string; store_id: string; sku: string }>(`SELECT v.id::text variant_id,s.id::text store_id,v.sku FROM product_variants v JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id WHERE v.sku IN('FASH-TEST-BLK-M','FASH-TEST-IVR-M') AND s.store_code IN('HYD-GAC-001','HYD-MAD-001') ORDER BY v.sku,s.store_code`);
  variantA = rows.rows.find((row) => row.sku === "FASH-TEST-BLK-M")!.variant_id;
  variantB = rows.rows.find((row) => row.sku === "FASH-TEST-IVR-M")!.variant_id;
  storeA = rows.rows.find((row) => row.sku === "FASH-TEST-BLK-M")!.store_id;
  storeB = rows.rows.find((row) => row.sku === "FASH-TEST-IVR-M" && row.store_id !== storeA)!.store_id;
  await pool.query("UPDATE store_inventory SET stock_quantity=4,is_available=TRUE WHERE variant_id IN($1,$2)", [variantA, variantB]);
  await pool.query("INSERT INTO store_operators(operator_key,store_id) VALUES($1,$2),($3,$4)", ["operator_a_123", storeA, "operator_b_123", storeB]);
});

describe("orders", () => {
  it("converts one reservation into one order without a second inventory decrement", async () => {
    const addressId = await createAddress("single");
    const reservationId = await reserveCart("single", addressId);
    const before = (await pool.query<{ stock: number }>("SELECT stock_quantity stock FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0]!.stock;
    const response = await request(app).post("/api/orders").set(headers("single")).set("Idempotency-Key", "order_single_1").send({ reservationId });
    expect(response.status).toBe(201);
    expect(response.body.data.storeOrders).toHaveLength(1);
    expect((await pool.query<{ stock: number }>("SELECT stock_quantity stock FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0]!.stock).toBe(before);
    expect((await pool.query("SELECT status FROM inventory_reservations WHERE id=$1", [reservationId])).rows[0]!.status).toBe("consumed");
  });

  it("is idempotent and prevents a reservation from creating another order", async () => {
    const addressId = await createAddress("idem");
    const reservationId = await reserveCart("idem", addressId);
    const first = await request(app).post("/api/orders").set(headers("idem")).set("Idempotency-Key", "order_idem_1").send({ reservationId });
    const second = await request(app).post("/api/orders").set(headers("idem")).set("Idempotency-Key", "order_idem_1").send({ reservationId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect((await pool.query("SELECT COUNT(*)::int count FROM customer_orders")).rows[0].count).toBe(1);
  });

  it("supports partial fulfilment and restores rejected inventory exactly once", async () => {
    const addressId = await createAddress("partial");
    const reservationId = await reserveCart("partial", addressId, true);
    const order = await request(app).post("/api/orders").set(headers("partial")).set("Idempotency-Key", "order_partial_1").send({ reservationId });
    expect(order.status).toBe(201);
    const storeOrders = order.body.data.storeOrders as Array<{ id: string; storeId: string }>;
    const a = storeOrders.find((item) => item.storeId === storeA)!;
    const b = storeOrders.find((item) => item.storeId === storeB)!;
    expect((await request(app).post(`/api/store-orders/${a.id}/accept`).set("X-Store-Operator", "operator_a_123")).status).toBe(200);
    const rejected = await request(app).post(`/api/store-orders/${b.id}/reject`).set("X-Store-Operator", "operator_b_123").send({ reasonCode: "OUT_OF_STOCK", note: "Demo rejection" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("partially_rejected");
    const stocks = await pool.query<{ store_id: string; stock_quantity: number }>("SELECT store_id::text,stock_quantity FROM store_inventory WHERE (store_id=$1 AND variant_id=$2) OR (store_id=$3 AND variant_id=$4)", [storeA, variantA, storeB, variantB]);
    expect(stocks.rows.find((row) => row.store_id === storeA)!.stock_quantity).toBe(3);
    expect(stocks.rows.find((row) => row.store_id === storeB)!.stock_quantity).toBe(4);
    const repeated = await request(app).post(`/api/store-orders/${b.id}/reject`).set("X-Store-Operator", "operator_b_123").send({ reasonCode: "OUT_OF_STOCK" });
    expect(repeated.status).toBe(409);
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments")).rows[0].count).toBe(1);
  });

  it("protects store operations and enforces workflow transitions", async () => {
    const addressId = await createAddress("workflow");
    const reservationId = await reserveCart("workflow", addressId);
    const order = await request(app).post("/api/orders").set(headers("workflow")).set("Idempotency-Key", "order_workflow_1").send({ reservationId });
    const id = order.body.data.storeOrders[0].id as string;
    expect((await request(app).post(`/api/store-orders/${id}/accept`)).status).toBe(401);
    expect((await request(app).post(`/api/store-orders/${id}/start-preparation`).set("X-Store-Operator", "operator_a_123")).status).toBe(409);
    expect((await request(app).post(`/api/store-orders/${id}/accept`).set("X-Store-Operator", "operator_a_123")).status).toBe(200);
    expect((await request(app).post(`/api/store-orders/${id}/start-preparation`).set("X-Store-Operator", "operator_a_123")).status).toBe(200);
    expect((await request(app).post(`/api/store-orders/${id}/ready`).set("X-Store-Operator", "operator_a_123")).status).toBe(200);
  });
  it("lists a newly placed pending fulfilment only for its authorized store operator", async () => {
    const addressId = await createAddress("store_listing");
    const reservationId = await reserveCart("store_listing", addressId);
    const order = await request(app).post("/api/orders").set(headers("store_listing")).set("Idempotency-Key", "order_store_listing_1").send({ reservationId });
    const storeOrder = order.body.data.storeOrders[0] as { id: string; storeId: string };
    const visible = await request(app).get("/api/store-orders").set("X-Store-Operator", "operator_a_123");
    expect(visible.status).toBe(200);
    expect(visible.body.store).toMatchObject({ id: storeOrder.storeId });
    expect(visible.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: storeOrder.id, status: "pending_acceptance" })]));
    const otherStore = await request(app).get("/api/store-orders").set("X-Store-Operator", "operator_b_123");
    expect(otherStore.status).toBe(200);
    expect(otherStore.body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: storeOrder.id })]));
    expect((await request(app).get("/api/store-orders").set("X-Store-Operator", "operator_missing_123")).status).toBe(403);
  });
  it("cancels an eligible customer order and restores stock exactly once", async () => {
    const addressId = await createAddress("cancel");
    const reservationId = await reserveCart("cancel", addressId);
    const order = await request(app).post("/api/orders").set(headers("cancel")).set("Idempotency-Key", "order_cancel_1").send({ reservationId });
    const before = (await pool.query<{ stock: number }>("SELECT stock_quantity stock FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0]!.stock;
    const cancelled = await request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel"));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    expect((await pool.query<{ stock: number }>("SELECT stock_quantity stock FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0]!.stock).toBe(before + 1);
    expect(await request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel"))).toMatchObject({ status: 409 });
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments WHERE adjustment_type='CANCELLATION_RESTORE'")).rows[0].count).toBe(1);
  });
  it("serializes concurrent cancellation requests and restores each cart line once", async () => {
    const addressId = await createAddress("cancel_race");
    const reservationId = await reserveCart("cancel_race", addressId);
    const order = await request(app).post("/api/orders").set(headers("cancel_race")).set("Idempotency-Key", "order_cancel_race_1").send({ reservationId });
    const results = await Promise.all([
      Promise.resolve().then(() => request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel_race"))),
      Promise.resolve().then(() => request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel_race"))),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments WHERE adjustment_type='CANCELLATION_RESTORE'")).rows[0].count).toBe(1);
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0].stock_quantity).toBe(4);
  });

  it("cancels all eligible fulfilments in a multi-store order without merging stores", async () => {
    const addressId = await createAddress("cancel_multi");
    const reservationId = await reserveCart("cancel_multi", addressId, true);
    const order = await request(app).post("/api/orders").set(headers("cancel_multi")).set("Idempotency-Key", "order_cancel_multi_1").send({ reservationId });
    const cancelled = await request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel_multi"));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    expect((await pool.query("SELECT COUNT(*)::int count FROM store_orders WHERE customer_order_id=$1 AND status='cancelled'", [order.body.data.id])).rows[0].count).toBe(2);
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments WHERE adjustment_type='CANCELLATION_RESTORE'")).rows[0].count).toBe(2);
    const stocks = await pool.query<{ store_id: string; stock_quantity: number }>("SELECT store_id::text,stock_quantity FROM store_inventory WHERE (store_id=$1 AND variant_id=$2) OR (store_id=$3 AND variant_id=$4)", [storeA, variantA, storeB, variantB]);
    expect(stocks.rows.find((row) => row.store_id === storeA)!.stock_quantity).toBe(4);
    expect(stocks.rows.find((row) => row.store_id === storeB)!.stock_quantity).toBe(4);
  });

  it("keeps an in-transit store fulfilment active while cancelling another store", async () => {
    const addressId = await createAddress("cancel_partial");
    const reservationId = await reserveCart("cancel_partial", addressId, true);
    const order = await request(app).post("/api/orders").set(headers("cancel_partial")).set("Idempotency-Key", "order_cancel_partial_1").send({ reservationId });
    const storeOrders = order.body.data.storeOrders as Array<{ id: string; storeId: string }>;
    const active = storeOrders.find((entry) => entry.storeId === storeA)!;
    const cancellable = storeOrders.find((entry) => entry.storeId === storeB)!;
    await request(app).post(`/api/store-orders/${active.id}/accept`).set("X-Store-Operator", "operator_a_123");
    await request(app).post(`/api/store-orders/${active.id}/start-preparation`).set("X-Store-Operator", "operator_a_123");
    await request(app).post(`/api/store-orders/${active.id}/ready`).set("X-Store-Operator", "operator_a_123");
    await pool.query("INSERT INTO delivery_dispatchers(identity_key,role) VALUES('cancel_dispatch_1','admin')");
    const agent = (await pool.query<{ id: string }>("INSERT INTO delivery_agents(agent_code,identity_key,name,phone) VALUES('CANCEL-AGENT','cancel_agent_1','Cancellation Agent','9876543210') RETURNING id::text")).rows[0]!;
    const taskId = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [active.id])).rows[0]!.id;
    await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "cancel_dispatch_1").send({ agentId: agent.id });
    await request(app).post(`/api/agent/deliveries/${taskId}/heading-to-store`).set("X-Agent-Identity", "cancel_agent_1");
    await request(app).post(`/api/agent/deliveries/${taskId}/arrived-at-store`).set("X-Agent-Identity", "cancel_agent_1");
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/pickup`).set("X-Agent-Identity", "cancel_agent_1")).status).toBe(200);
    const cancelled = await request(app).post(`/api/orders/${order.body.data.id}/cancel`).set(headers("cancel_partial"));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("partially_rejected");
    expect((await pool.query("SELECT status FROM store_orders WHERE id=$1", [active.id])).rows[0].status).toBe("ready_for_pickup");
    expect((await pool.query("SELECT status FROM store_orders WHERE id=$1", [cancellable.id])).rows[0].status).toBe("cancelled");
    expect((await pool.query("SELECT status FROM delivery_tasks WHERE id=$1", [taskId])).rows[0].status).toBe("picked_up");
    const stocks = await pool.query<{ store_id: string; stock_quantity: number }>("SELECT store_id::text,stock_quantity FROM store_inventory WHERE (store_id=$1 AND variant_id=$2) OR (store_id=$3 AND variant_id=$4)", [storeA, variantA, storeB, variantB]);
    expect(stocks.rows.find((row) => row.store_id === storeA)!.stock_quantity).toBe(3);
    expect(stocks.rows.find((row) => row.store_id === storeB)!.stock_quantity).toBe(4);
  });
});
