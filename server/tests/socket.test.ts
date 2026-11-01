import { createServer } from "node:http";
import request from "supertest";
import { io as Client, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { attachSocket } from "../src/socket.js";
import { pool } from "../src/db/pool.js";

const session = (name: string) => `socket_session_${name.padEnd(12, "x")}`;
const header = (name: string) => ({ "X-Cart-Session": session(name) });
let variant = "", store = "";

async function setupDelivery(name: string) {
  const address = await request(app).post("/api/addresses").set(header(name)).send({ label: "Home", recipientName: "Socket Customer", phone: "9876543210", addressLine1: "Demo", addressLine2: "", city: "Hyderabad", state: "Telangana", postalCode: "500032", latitude: 17.4401, longitude: 78.3489, isDefault: true });
  await request(app).post("/api/cart/items").set(header(name)).send({ variantId: variant, storeId: store, quantity: 1 });
  const reservation = await request(app).post("/api/checkout/reservations").set(header(name)).set("Idempotency-Key", `socket-res-${name}`).send({ addressId: address.body.data.id });
  const order = await request(app).post("/api/orders").set(header(name)).set("Idempotency-Key", `socket-ord-${name}`).send({ reservationId: reservation.body.data.id });
  const storeOrderId = order.body.data.storeOrders[0].id as string;
  await request(app).post(`/api/store-orders/${storeOrderId}/accept`).set("X-Store-Operator", "socket_store_operator");
  await request(app).post(`/api/store-orders/${storeOrderId}/start-preparation`).set("X-Store-Operator", "socket_store_operator");
  await request(app).post(`/api/store-orders/${storeOrderId}/ready`).set("X-Store-Operator", "socket_store_operator");
  const taskId = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [storeOrderId])).rows[0]!.id;
  const agent = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_agents WHERE identity_key='socket_agent_1'")).rows[0]!.id;
  await request(app).post(`/api/dispatch/tasks/${taskId}/assign`).set("X-Dispatch-Identity", "socket_dispatcher").send({ agentId: agent });
  return { orderId: order.body.data.id as string, taskId };
}

function connected(socket: Socket) { return new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("connect_error", reject); }); }
function close(socket: Socket) { socket.close(); }

describe("Socket.IO delivery authorization and events", () => {
  let httpServer: ReturnType<typeof createServer>;
  let socketServer: ReturnType<typeof attachSocket>;
  beforeEach(async () => {
    await pool.query("TRUNCATE delivery_task_locations,delivery_status_history,delivery_assignments,delivery_tasks,delivery_agents,delivery_dispatchers,order_inventory_adjustments,order_items,store_order_status_history,order_status_history,store_orders,customer_orders,store_operators,inventory_reservation_items,inventory_reservations,checkout_attempts,cart_items,carts,customer_addresses RESTART IDENTITY CASCADE");
    const row = (await pool.query<{ variant_id: string; store_id: string }>(`SELECT v.id::text variant_id,s.id::text store_id FROM product_variants v JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id WHERE v.sku='FASH-TEST-BLK-M' AND s.store_code='HYD-GAC-001'`)).rows[0]!;
    variant = row.variant_id; store = row.store_id;
    await pool.query("UPDATE store_inventory SET stock_quantity=4,is_available=TRUE WHERE store_id=$1 AND variant_id=$2", [store, variant]);
    await pool.query("INSERT INTO store_operators(operator_key,store_id) VALUES('socket_store_operator',$1)", [store]);
    await pool.query("INSERT INTO delivery_dispatchers(identity_key,role) VALUES('socket_dispatcher','admin')");
    await pool.query("INSERT INTO delivery_agents(agent_code,identity_key,name,phone) VALUES('SOCKET-1','socket_agent_1','Socket Agent','9876543210'),('SOCKET-2','socket_agent_2','Second Agent','9876543211')");
    httpServer = createServer(app); socketServer = attachSocket(httpServer); await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  });
  afterEach(async () => { socketServer.close(); await new Promise<void>((resolve) => httpServer.close(() => resolve())); });

  it("isolates customer order rooms and publishes accepted locations only", async () => {
    const { orderId, taskId } = await setupDelivery("owner");
    const owner = Client(`http://localhost:${(httpServer.address() as { port: number }).port}`, { auth: { sessionId: session("owner") }, transports: ["websocket"] });
    const foreign = Client(`http://localhost:${(httpServer.address() as { port: number }).port}`, { auth: { sessionId: session("foreign") }, transports: ["websocket"] });
    await Promise.all([connected(owner), connected(foreign)]);
    const ownAck = await new Promise<{ ok: boolean }>((resolve) => owner.emit("order:join", orderId, resolve));
    const foreignAck = await new Promise<{ ok: boolean }>((resolve) => foreign.emit("order:join", orderId, resolve));
    expect(ownAck.ok).toBe(true); expect(foreignAck.ok).toBe(false);
    const event = new Promise<Record<string, unknown>>((resolve) => owner.once("delivery:location_updated", resolve));
    await request(app).post(`/api/agent/deliveries/${taskId}/location`).set("X-Agent-Identity", "socket_agent_1").send({ latitude: 17.44, longitude: 78.35, accuracyMeters: 10, capturedAt: new Date().toISOString() });
    expect((await event).taskId).toBe(taskId);
    close(owner); close(foreign);
  });

  it("revokes the previous agent's delivery room after reassignment", async () => {
    const { taskId } = await setupDelivery("reassign");
    const port = (httpServer.address() as { port: number }).port;
    const oldAgent = Client(`http://localhost:${port}`, { auth: { agentIdentity: "socket_agent_1" }, transports: ["websocket"] });
    await connected(oldAgent);
    const ack = await new Promise<{ ok: boolean }>((resolve) => oldAgent.emit("delivery:join", taskId, resolve)); expect(ack.ok).toBe(true);
    const second = (await pool.query<{ id: string }>("SELECT id::text FROM delivery_agents WHERE identity_key='socket_agent_2'")).rows[0]!.id;
    await request(app).post(`/api/dispatch/tasks/${taskId}/reassign`).set("X-Dispatch-Identity", "socket_dispatcher").send({ agentId: second });
    const oldEvents: unknown[] = []; oldAgent.on("delivery:location_updated", (value) => oldEvents.push(value));
    await request(app).post(`/api/agent/deliveries/${taskId}/location`).set("X-Agent-Identity", "socket_agent_2").send({ latitude: 17.44, longitude: 78.35, accuracyMeters: 10, capturedAt: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(oldEvents).toHaveLength(0);
    close(oldAgent);
  });
});
