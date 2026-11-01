import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { pool } from "./db/pool.js";
import { deliveryEvents } from "./realtime.js";
import { guestSessionFromCookie, validGuestSession } from "./middleware/guest-session.js";

type Identity = { sessionId?: string; agentId?: string; dispatchRole?: string };
export function attachSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL?.split(",").map((value) => value.trim()) ?? [], methods: ["GET", "POST"], credentials: true } });
  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as { sessionId?: string; agentIdentity?: string; dispatchIdentity?: string };
    const identity: Identity = {};
    try {
      const cookieSession = guestSessionFromCookie(socket.handshake.headers.cookie);
      if (validGuestSession(cookieSession)) identity.sessionId = cookieSession;
      else if (validGuestSession(auth.sessionId)) identity.sessionId = auth.sessionId;
      if (auth.agentIdentity) {
        const agent = (await pool.query<{ id: string; status: string }>("SELECT id::text,status FROM delivery_agents WHERE identity_key=$1", [auth.agentIdentity])).rows[0];
        if (!agent || agent.status !== "active") return next(new Error("AGENT_FORBIDDEN"));
        identity.agentId = agent.id;
      }
      if (auth.dispatchIdentity) {
        const dispatcher = (await pool.query<{ role: string }>("SELECT role FROM delivery_dispatchers WHERE identity_key=$1 AND is_active", [auth.dispatchIdentity])).rows[0];
        if (!dispatcher) return next(new Error("DISPATCH_FORBIDDEN"));
        identity.dispatchRole = dispatcher.role;
      }
      if (!identity.sessionId && !identity.agentId && !identity.dispatchRole) return next(new Error("AUTH_REQUIRED"));
      socket.data.identity = identity;
      next();
    } catch (error) { next(error as Error); }
  });
  io.on("connection", (socket) => {
    const identity = socket.data.identity as Identity;
    socket.on("order:join", async (orderId: string, acknowledge?: (result: { ok: boolean; error?: string }) => void) => {
      if (!identity.sessionId) return acknowledge?.({ ok: false, error: "CUSTOMER_AUTH_REQUIRED" });
      const owned = (await pool.query("SELECT 1 FROM customer_orders WHERE id=$1 AND session_id=$2", [orderId, identity.sessionId])).rowCount === 1;
      if (!owned) return acknowledge?.({ ok: false, error: "ORDER_FORBIDDEN" });
      socket.join(`order:${orderId}`); acknowledge?.({ ok: true });
    });
    socket.on("delivery:join", async (taskId: string, acknowledge?: (result: { ok: boolean; error?: string }) => void) => {
      const row = (await pool.query<{ order_id: string; agent_id: string | null; session_id: string }>("SELECT dt.customer_order_id::text AS order_id,a.agent_id::text,co.session_id FROM delivery_tasks dt JOIN customer_orders co ON co.id=dt.customer_order_id LEFT JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' WHERE dt.id=$1", [taskId])).rows[0];
      if (!row) return acknowledge?.({ ok: false, error: "DELIVERY_NOT_FOUND" });
      const allowed = identity.dispatchRole || identity.sessionId === row.session_id || identity.agentId === row.agent_id;
      if (!allowed) return acknowledge?.({ ok: false, error: "DELIVERY_FORBIDDEN" });
      socket.join(`delivery:${taskId}`); if (identity.agentId) socket.join(`agent:${identity.agentId}`); acknowledge?.({ ok: true });
    });
  });
  const eventNames = ["order:created", "order:store_status_updated", "delivery:status_updated", "delivery:location_updated", "delivery:assignment_changed", "delivery:completed", "delivery:failed"] as const;
  for (const eventName of eventNames) deliveryEvents.on(eventName, async (payload: { orderId?: string; taskId?: string; agentId?: string; previousAgentId?: string }) => {
    if (payload.orderId) io.to(`order:${payload.orderId}`).emit(eventName, payload);
    if (payload.taskId) io.to(`delivery:${payload.taskId}`).emit(eventName, payload);
    if (payload.agentId) io.to(`agent:${payload.agentId}`).emit(eventName, payload);
    if (eventName === "delivery:assignment_changed" && payload.taskId && payload.previousAgentId && payload.previousAgentId !== payload.agentId) {
      const sockets = await io.in(`delivery:${payload.taskId}`).fetchSockets();
      for (const client of sockets) if (client.data.identity?.agentId === payload.previousAgentId) { client.leave(`delivery:${payload.taskId}`); client.leave(`agent:${payload.previousAgentId}`); }
    }
  });
  return io;
}
