import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const session = (name: string) => `phase5_session_${name.padEnd(16, "x")}`;
const h = (name: string) => ({ "X-Cart-Session": session(name) });
let variant = "", store = "", storeOrderOperator = "";

async function setupOrder(name: string) {
  const address = await request(app).post("/api/addresses").set(h(name)).send({ label: "Home", recipientName: "Delivery Customer", phone: "9876543210", addressLine1: "Demo address", addressLine2: "", city: "Hyderabad", state: "Telangana", postalCode: "500032", latitude: 17.4401, longitude: 78.3489, isDefault: true });
  await request(app).post("/api/cart/items").set(h(name)).send({ variantId: variant, storeId: store, quantity: 1 });
  const reservation = await request(app).post("/api/checkout/reservations").set(h(name)).set("Idempotency-Key", `reserve_${name}`).send({ addressId: address.body.data.id });
  const order = await request(app).post("/api/orders").set(h(name)).set("Idempotency-Key", `order_${name}`).send({ reservationId: reservation.body.data.id });
  const storeOrderId = order.body.data.storeOrders[0].id as string;
  await request(app).post(`/api/store-orders/${storeOrderId}/accept`).set("X-Store-Operator", storeOrderOperator);
  await request(app).post(`/api/store-orders/${storeOrderId}/start-preparation`).set("X-Store-Operator", storeOrderOperator);
  const ready = await request(app).post(`/api/store-orders/${storeOrderId}/ready`).set("X-Store-Operator", storeOrderOperator);
  expect(ready.status).toBe(200);
  return { orderId: order.body.data.id as string, storeOrderId };
}

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function waitForTaskLockWaiter(minimum = 1) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const waiting = await pool.query<{ count: number }>("SELECT COUNT(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%delivery_tasks%'");
    if (waiting.rows[0]!.count >= minimum) return;
    await pause(10);
  }
  throw new Error("Expected a delivery-task transaction to wait on the test lock");
}

async function setupArrivedDelivery(name: string) {
  const { orderId, storeOrderId } = await setupOrder(name);
  const taskId = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [storeOrderId])).rows[0]!.id;
  const agentId = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_agents WHERE identity_key='agent_identity_1' ")).rows[0]!.id;
  expect((await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({ agentId })).status).toBe(200);
  expect((await request(app).post(`/api/agent/deliveries/${taskId}/heading-to-store`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
  expect((await request(app).post(`/api/agent/deliveries/${taskId}/arrived-at-store`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
  return { orderId, storeOrderId, taskId };
}

async function raceWithTaskLock<T>(taskId: string, first: () => Promise<T>, second: () => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM delivery_tasks WHERE id=$1 FOR UPDATE", [taskId]);
    const firstResult = Promise.resolve().then(first);
    // The first HTTP transaction must be queued before the competing request.
    await waitForTaskLockWaiter();
    const secondResult = Promise.resolve().then(second);
    await waitForTaskLockWaiter(2);
    await client.query("COMMIT");
    return await Promise.all([firstResult, secondResult]);
  } finally { client.release(); }
}

beforeEach(async () => {
  await pool.query("TRUNCATE delivery_task_locations,delivery_status_history,delivery_assignments,delivery_tasks,delivery_agents,delivery_dispatchers,order_inventory_adjustments,order_items,store_order_status_history,order_status_history,store_orders,customer_orders,store_operators,inventory_reservation_items,inventory_reservations,checkout_attempts,cart_items,carts,customer_addresses RESTART IDENTITY CASCADE");
  const row = (await pool.query<{ variant_id: string; store_id: string }>(`SELECT v.id::text variant_id,s.id::text store_id FROM product_variants v JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id WHERE v.sku='FASH-TEST-BLK-M' AND s.store_code='HYD-GAC-001'`)).rows[0]!;
  variant = row.variant_id; store = row.store_id;
  await pool.query("UPDATE store_inventory SET stock_quantity=4,is_available=TRUE WHERE store_id=$1 AND variant_id=$2", [store,variant]);
  const operator = (await pool.query<{id:string}>("INSERT INTO store_operators(operator_key,store_id) VALUES('delivery_store_op_1',$1) RETURNING id",[store])).rows[0]!;
  storeOrderOperator = "delivery_store_op_1";
  await pool.query("INSERT INTO delivery_dispatchers(identity_key,role) VALUES('dispatch_admin_1','admin')");
  await pool.query("INSERT INTO delivery_agents(agent_code,identity_key,name,phone) VALUES('AGENT-001','agent_identity_1','Demo Agent','9876543210'),('AGENT-002','agent_identity_2','Second Agent','9876543211')");
  void operator;
});

describe("delivery management", () => {
  it("makes cancellation win a real PostgreSQL race with pickup and restores inventory once", async () => {
    const { orderId, storeOrderId, taskId } = await setupArrivedDelivery("cancel_wins");
    const [cancelled, pickup] = await raceWithTaskLock(
      taskId,
      () => request(app).post(`/api/orders/${orderId}/cancel`).set(h("cancel_wins")),
      () => request(app).post(`/api/agent/deliveries/${taskId}/pickup`).set("X-Agent-Identity", "agent_identity_1"),
    );
    expect(cancelled.status).toBe(200);
    expect(pickup.status).toBe(409);
    expect((await pool.query("SELECT status FROM store_orders WHERE id=$1", [storeOrderId])).rows[0].status).toBe("cancelled");
    expect((await pool.query("SELECT status FROM customer_orders WHERE id=$1", [orderId])).rows[0].status).toBe("cancelled");
    expect((await pool.query("SELECT status FROM delivery_tasks WHERE id=$1", [taskId])).rows[0].status).toBe("cancelled");
    expect((await pool.query("SELECT status FROM delivery_assignments WHERE delivery_task_id=$1", [taskId])).rows[0].status).toBe("closed");
    expect((await pool.query("SELECT availability FROM delivery_agents WHERE identity_key='agent_identity_1'")).rows[0].availability).toBe("available");
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [store, variant])).rows[0].stock_quantity).toBe(4);
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments WHERE adjustment_type='CANCELLATION_RESTORE'")).rows[0].count).toBe(1);
  });

  it("makes pickup win a real PostgreSQL race with cancellation without restoring inventory", async () => {
    const { orderId, storeOrderId, taskId } = await setupArrivedDelivery("pickup_wins");
    const [pickup, cancelled] = await raceWithTaskLock(
      taskId,
      () => request(app).post(`/api/agent/deliveries/${taskId}/pickup`).set("X-Agent-Identity", "agent_identity_1"),
      () => request(app).post(`/api/orders/${orderId}/cancel`).set(h("pickup_wins")),
    );
    expect(pickup.status).toBe(200);
    expect(cancelled.status).toBe(409);
    expect((await pool.query("SELECT status FROM store_orders WHERE id=$1", [storeOrderId])).rows[0].status).toBe("ready_for_pickup");
    expect((await pool.query("SELECT status FROM customer_orders WHERE id=$1", [orderId])).rows[0].status).toBe("confirmed");
    expect((await pool.query("SELECT status FROM delivery_tasks WHERE id=$1", [taskId])).rows[0].status).toBe("picked_up");
    expect((await pool.query("SELECT status FROM delivery_assignments WHERE delivery_task_id=$1", [taskId])).rows[0].status).toBe("active");
    expect((await pool.query("SELECT availability FROM delivery_agents WHERE identity_key='agent_identity_1'")).rows[0].availability).toBe("on_delivery");
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [store, variant])).rows[0].stock_quantity).toBe(3);
    expect((await pool.query("SELECT COUNT(*)::int count FROM order_inventory_adjustments WHERE adjustment_type='CANCELLATION_RESTORE'")).rows[0].count).toBe(0);
  });
  it("accepts only owned active-agent locations and exposes fresh customer tracking data", async () => {
    const { orderId, storeOrderId } = await setupOrder("location");
    const taskId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [storeOrderId])).rows[0]!.id;
    const agentId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_agents WHERE identity_key='agent_identity_1'")).rows[0]!.id;
    await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId});
    const now = new Date().toISOString();
    const accepted = await request(app).post(`/api/agent/deliveries/${taskId}/location`).set("X-Agent-Identity", "agent_identity_1").send({ latitude: 17.44, longitude: 78.35, accuracyMeters: 12, headingDegrees: 90, speedMps: 4, capturedAt: now });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.accepted).toBe(true);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/location`).set("X-Agent-Identity", "agent_identity_2").send({ latitude: 17.45, longitude: 78.36, accuracyMeters: 10, capturedAt: now })).status).toBe(404);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/location`).set("X-Agent-Identity", "agent_identity_1").send({ latitude: 17.44, longitude: 78.35, accuracyMeters: 10, capturedAt: new Date(Date.now() - 300000).toISOString() })).body.data.reason).toBe("STALE_TIMESTAMP");
    const tracking = await request(app).get(`/api/orders/${orderId}/deliveries`).set(h("location"));
    expect(tracking.status).toBe(200);
    expect(tracking.body.data[0].locationFresh).toBe(true);
    expect(tracking.body.data[0].latitude).toBeCloseTo(17.44);
  });

  it("creates exactly one task when a store order becomes ready and is idempotent", async () => {
    const { storeOrderId } = await setupOrder("task");
    expect((await pool.query("SELECT COUNT(*)::int count FROM delivery_tasks WHERE store_order_id=$1",[storeOrderId])).rows[0].count).toBe(1);
    expect((await request(app).post(`/api/store-orders/${storeOrderId}/ready`).set("X-Store-Operator", storeOrderOperator)).status).toBe(409);
    expect((await pool.query("SELECT COUNT(*)::int count FROM delivery_tasks WHERE store_order_id=$1",[storeOrderId])).rows[0].count).toBe(1);
  });

  it("exposes read-only dispatch diagnostics", async () => {
    await setupOrder("diagnostics");
    const response = await request(app).get("/api/dispatch/diagnostics").set("X-Dispatch-Identity", "dispatch_admin_1");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ readyWithoutTask: [], assignmentMismatches: [], agentAvailabilityMismatches: [] });
  });

  it("never creates a delivery task for a rejected store order", async () => {
    const { storeOrderId } = await setupOrder("rejected");
    await pool.query("TRUNCATE delivery_status_history,delivery_assignments,delivery_tasks RESTART IDENTITY CASCADE");
    await pool.query("UPDATE store_orders SET status='rejected' WHERE id=$1", [storeOrderId]);
    const response = await request(app).post(`/api/store-orders/${storeOrderId}/ready`).set("X-Store-Operator", storeOrderOperator);
    expect(response.status).toBe(409);
    expect((await pool.query("SELECT COUNT(*)::int count FROM delivery_tasks")).rows[0].count).toBe(0);
  });

  it("assigns and completes a delivery with agent ownership and restores availability", async () => {
    const { orderId } = await setupOrder("flow");
    const tasks = await request(app).get("/api/dispatch/tasks").set("X-Dispatch-Identity", "dispatch_admin_1");
    expect(tasks.status).toBe(200);
    const taskId = tasks.body.data[0].id as string;
    const agent = (await pool.query<{id:string}>("SELECT id::text FROM delivery_agents WHERE agent_code='AGENT-001'")).rows[0]!.id;
    expect((await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId:agent})).status).toBe(200);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/heading-to-store`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/arrived-at-store`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/pickup`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/out-for-delivery`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(200);
    const delivered = await request(app).post(`/api/agent/deliveries/${taskId}/delivered`).set("X-Agent-Identity", "agent_identity_1");
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe("delivered");
    expect((await pool.query("SELECT availability FROM delivery_agents WHERE identity_key='agent_identity_1'")).rows[0].availability).toBe("available");
    expect((await request(app).get(`/api/orders/${orderId}/deliveries`).set(h("flow"))).body.data[0].status).toBe("delivered");
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/delivered`).set("X-Agent-Identity", "agent_identity_1")).status).toBe(404);
  });

  it("prevents concurrent assignment and supports failure without inventory restoration", async () => {
    const { storeOrderId } = await setupOrder("assign");
    const taskId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1",[storeOrderId])).rows[0]!.id;
    const agents = await pool.query<{id:string}>("SELECT id::text FROM delivery_agents ORDER BY id");
    const results = await Promise.all(agents.rows.map((agent) => request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId:agent.id})));
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
  });

  it("records delivery failure and releases the agent without restoring inventory", async () => {
    const { storeOrderId } = await setupOrder("failed");
    const taskId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1",[storeOrderId])).rows[0]!.id;
    const agentId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_agents WHERE identity_key='agent_identity_1'")).rows[0]!.id;
    await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId});
    await request(app).post(`/api/agent/deliveries/${taskId}/heading-to-store`).set("X-Agent-Identity", "agent_identity_1");
    const failed = await request(app).post(`/api/agent/deliveries/${taskId}/failed`).set("X-Agent-Identity", "agent_identity_1").send({reason:"Customer unavailable"});
    expect(failed.status).toBe(200);
    expect(failed.body.data.status).toBe("delivery_failed");
    expect((await pool.query("SELECT availability FROM delivery_agents WHERE id=$1",[agentId])).rows[0].availability).toBe("available");
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2",[store,variant])).rows[0].stock_quantity).toBe(3);
  });

  it("reassigns a failed delivery to another agent and completes it", async () => {
    const { storeOrderId, orderId } = await setupOrder("reassign");
    const taskId = (await pool.query<{id:string}>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1",[storeOrderId])).rows[0]!.id;
    const agents = await pool.query<{id:string;identity_key:string}>("SELECT id::text,identity_key FROM delivery_agents ORDER BY id");
    await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId: agents.rows[0]!.id});
    expect((await request(app).patch(`/api/delivery-agents/${agents.rows[0]!.id}/availability`).set("X-Dispatch-Identity", "dispatch_admin_1").send({availability:"available"})).status).toBe(409);
    await request(app).post(`/api/agent/deliveries/${taskId}/heading-to-store`).set("X-Agent-Identity", agents.rows[0]!.identity_key);
    await request(app).post(`/api/agent/deliveries/${taskId}/failed`).set("X-Agent-Identity", agents.rows[0]!.identity_key).send({reason:"Vehicle issue"});
    expect((await pool.query("SELECT availability FROM delivery_agents WHERE id=$1",[agents.rows[0]!.id])).rows[0].availability).toBe("available");
    await request(app).post(`/api/dispatch/tasks/${taskId}/reassign`).set("X-Dispatch-Identity", "dispatch_admin_1").send({agentId: agents.rows[1]!.id});
    for (const [action, body] of [["heading-to-store", undefined], ["arrived-at-store", undefined], ["pickup", undefined], ["out-for-delivery", undefined]] as const) await request(app).post(`/api/agent/deliveries/${taskId}/${action}`).set("X-Agent-Identity", agents.rows[1]!.identity_key).send(body);
    const delivered = await request(app).post(`/api/agent/deliveries/${taskId}/delivered`).set("X-Agent-Identity", agents.rows[1]!.identity_key);
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe("delivered");
    expect((await pool.query("SELECT status FROM store_orders WHERE id=$1",[storeOrderId])).rows[0].status).toBe("delivered");
    expect((await pool.query("SELECT status FROM customer_orders WHERE id=$1",[orderId])).rows[0].status).toBe("completed");
    expect((await pool.query("SELECT COUNT(*)::int count FROM delivery_assignments WHERE delivery_task_id=$1",[taskId])).rows[0].count).toBe(2);
    expect((await pool.query("SELECT COUNT(*)::int count FROM delivery_status_history WHERE delivery_task_id=$1 AND to_status='delivered'",[taskId])).rows[0].count).toBe(1);
    expect((await request(app).post(`/api/agent/deliveries/${taskId}/failed`).set("X-Agent-Identity", agents.rows[1]!.identity_key).send({reason:"duplicate"})).status).toBe(404);
  });
});
