import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { CommerceError } from "../utils/commerce-error.js";
import type { DeliveryStatus } from "../types/delivery.types.js";
import { deriveParentOrderStatus } from "../services/order-status.service.js";
import { orderEstimate } from "./eta.model.js";
import { env } from "../config/env.js";
import { publishDeliveryEvent } from "../realtime.js";

function taskNumber() { return `DLV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`; }

export async function ensureTask(client: PoolClient, storeOrderId: string) {
  const existing = (await client.query<{ id: string }>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [storeOrderId])).rows[0];
  if (existing) return existing.id;
  const source = (await client.query(`SELECT so.id::text,so.status,so.customer_order_id::text,o.address_snapshot, s.id::text AS store_id,s.store_code,s.name,s.address_line,s.landmark,s.area,s.city,s.state,s.postal_code,s.latitude::text,s.longitude::text FROM store_orders so JOIN customer_orders o ON o.id=so.customer_order_id JOIN stores s ON s.id=so.store_id WHERE so.id=$1 FOR UPDATE`, [storeOrderId])).rows[0];
  if (!source || source.status !== "ready_for_pickup") throw new CommerceError("DELIVERY_TASK_NOT_ELIGIBLE", "Delivery task requires a ready store order", 409);
  const task = (await client.query<{ id: string }>("INSERT INTO delivery_tasks(task_number,store_order_id,customer_order_id,status,pickup_snapshot,customer_address_snapshot) VALUES($1,$2,$3,'pending_assignment',$4,$5) ON CONFLICT(store_order_id) DO NOTHING RETURNING id::text", [taskNumber(),storeOrderId,source.customer_order_id,JSON.stringify({storeId:source.store_id,storeCode:source.store_code,name:source.name,addressLine:source.address_line,landmark:source.landmark,area:source.area,city:source.city,state:source.state,postalCode:source.postal_code,latitude:Number(source.latitude),longitude:Number(source.longitude)}),source.address_snapshot])).rows[0];
  const id = task?.id ?? (await client.query<{ id: string }>("SELECT id::text FROM delivery_tasks WHERE store_order_id=$1", [storeOrderId])).rows[0]!.id;
  if (task) await client.query("INSERT INTO delivery_status_history(delivery_task_id,to_status,actor_type,note) VALUES($1,'pending_assignment','system','Created when store order became ready for pickup')", [id]);
  return id;
}

async function taskRow(client: PoolClient, id: string, lock = false) {
  const row = (await client.query(`SELECT dt.id::text,dt.task_number AS "taskNumber",dt.store_order_id::text AS "storeOrderId",dt.customer_order_id::text AS "customerOrderId",dt.status,dt.pickup_snapshot AS "pickupSnapshot",dt.customer_address_snapshot AS "customerAddressSnapshot",dt.failure_reason AS "failureReason",dt.assigned_at AS "assignedAt",dt.picked_up_at AS "pickedUpAt",dt.delivered_at AS "deliveredAt",dt.failed_at AS "failedAt",a.id::text AS "assignmentId",a.agent_id::text AS "agentId",da.agent_code AS "agentCode",da.name AS "agentName",a.status AS "assignmentStatus" FROM delivery_tasks dt LEFT JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' LEFT JOIN delivery_agents da ON da.id=a.agent_id WHERE dt.id=$1 ${lock ? "FOR UPDATE OF dt" : ""}`, [id])).rows[0];
  if (!row) return row;
  const eta = await orderEstimate(client, row.storeOrderId as string);
  return { ...row, eta: eta[0] ?? null };
}

export async function listTasks(limit = 50, cursor?: string) {
  const values: unknown[] = [limit + 1]; const cursorClause = cursor ? (values.push(cursor), `WHERE dt.id < $${values.length}::bigint`) : "";
  const rows = (await pool.query(`SELECT dt.id::text,dt.task_number AS "taskNumber",dt.store_order_id::text AS "storeOrderId",dt.status,dt.created_at AS "createdAt",da.agent_code AS "agentCode",da.name AS "agentName" FROM delivery_tasks dt LEFT JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' LEFT JOIN delivery_agents da ON da.id=a.agent_id ${cursorClause} ORDER BY dt.id DESC LIMIT $1`, values)).rows;
  const hasNextPage = rows.length > limit; const data = rows.slice(0, limit); return { data, pagination: { limit, hasNextPage, nextCursor: hasNextPage ? data.at(-1)!.id : null } };
}

export async function getTask(id: string) { const client = await pool.connect(); try { return await taskRow(client,id); } finally { client.release(); } }

export async function createAgent(input: { agentCode: string; identityKey: string; name: string; phone: string }) {
  const result = await pool.query("INSERT INTO delivery_agents(agent_code,identity_key,name,phone) VALUES($1,$2,$3,$4) RETURNING id::text,agent_code AS \"agentCode\",name,phone,status,availability,created_at AS \"createdAt\"", [input.agentCode,input.identityKey,input.name,input.phone]); return result.rows[0];
}
export async function listAgents() { return (await pool.query("SELECT id::text,agent_code AS \"agentCode\",name,phone,status,availability,created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM delivery_agents ORDER BY id")).rows; }
export async function getAgent(id: string) { return (await pool.query("SELECT id::text,agent_code AS \"agentCode\",name,phone,status,availability,created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM delivery_agents WHERE id=$1", [id])).rows[0] ?? null; }
export async function patchAgent(id: string, input: Record<string, unknown>) { const values: unknown[] = []; const sets = Object.entries(input).map(([key,value],index) => { const column = key === "agentCode" ? "agent_code" : key; values.push(value); return `${column}=$${index+1}`; }); values.push(id); const result = await pool.query(`UPDATE delivery_agents SET ${sets.join(",")},updated_at=NOW() WHERE id=$${values.length} RETURNING id::text,agent_code AS \"agentCode\",name,phone,status,availability,updated_at AS \"updatedAt\"`, values); return result.rows[0] ?? null; }
export async function setAvailability(id: string, availability: "available" | "unavailable") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const agent = (await client.query<{ id: string; status: string }>("SELECT id::text,status FROM delivery_agents WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!agent) { await client.query("ROLLBACK"); return null; }
    if (agent.status !== "active") throw new CommerceError("AGENT_NOT_ELIGIBLE", "Agent is not active", 409);
    const active = (await client.query("SELECT id FROM delivery_assignments WHERE agent_id=$1 AND status='active'", [id])).rows[0];
    if (active) throw new CommerceError("AGENT_HAS_ACTIVE_DELIVERY", "Agent availability cannot change during an active delivery", 409);
    const result = await client.query("UPDATE delivery_agents SET availability=$2,updated_at=NOW() WHERE id=$1 RETURNING id::text,availability", [id,availability]);
    await client.query("COMMIT"); return result.rows[0] ?? null;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function assign(taskId: string, agentId: string, actor: string, reassign = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await taskRow(client, taskId, true); if (!task) throw new CommerceError("DELIVERY_NOT_FOUND", "Delivery task not found", 404);
    if (["picked_up","out_for_delivery","delivered"].includes(task.status)) throw new CommerceError("DELIVERY_REASSIGN_FORBIDDEN", "Delivery cannot be reassigned after pickup", 409);
    // Re-read after locking the task. A joined row can have been snapshotted before
    // it waited on this lock, so it is not safe as the sole concurrency guard.
    const activeAssignment = (await client.query<{ id: string; agent_id: string }>("SELECT id::text,agent_id::text FROM delivery_assignments WHERE delivery_task_id=$1 AND status='active' FOR UPDATE", [taskId])).rows[0];
    if (activeAssignment && !reassign) throw new CommerceError("DELIVERY_ALREADY_ASSIGNED", "Delivery task already has an active assignment", 409);
    const agent = (await client.query("SELECT id::text,status,availability FROM delivery_agents WHERE id=$1 FOR UPDATE", [agentId])).rows[0];
    if (!agent || agent.status !== "active") throw new CommerceError("AGENT_NOT_ELIGIBLE", "Agent is not active", 409);
    if (agent.availability !== "available" && !(reassign && activeAssignment?.agent_id === agentId)) throw new CommerceError("AGENT_NOT_AVAILABLE", "Agent is not available", 409);
    if (activeAssignment) {
      await client.query("UPDATE delivery_assignments SET status='closed',closed_at=NOW() WHERE id=$1 AND status='active'", [activeAssignment.id]);
      await client.query("UPDATE delivery_agents SET availability='available',updated_at=NOW() WHERE id=$1", [activeAssignment.agent_id]);
    }
    await client.query("INSERT INTO delivery_assignments(delivery_task_id,agent_id) VALUES($1,$2)", [taskId,agentId]);
    await client.query("UPDATE delivery_agents SET availability='on_delivery',updated_at=NOW() WHERE id=$1", [agentId]);
    const next: DeliveryStatus = "assigned"; const previous = task.status;
    await client.query("UPDATE delivery_tasks SET status=$2,assigned_at=NOW(),updated_at=NOW() WHERE id=$1", [taskId,next]);
    await client.query("INSERT INTO delivery_status_history(delivery_task_id,from_status,to_status,actor_type,actor_id,note) VALUES($1,$2,$3,'dispatcher',$4,$5)", [taskId,previous,next,actor,reassign ? "Delivery reassigned" : "Delivery assigned"]);
    const previousAgentId = activeAssignment?.agent_id;
    const result = await taskRow(client,taskId); await client.query("COMMIT"); publishDeliveryEvent("delivery:assignment_changed", { taskId, orderId: result?.customerOrderId, agentId, previousAgentId }); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

const transitions: Record<string, { from: DeliveryStatus[]; to: DeliveryStatus }> = {
  heading: { from: ["assigned"], to: "heading_to_store" }, arrived: { from: ["heading_to_store"], to: "arrived_at_store" }, pickup: { from: ["arrived_at_store"], to: "picked_up" }, out: { from: ["picked_up"], to: "out_for_delivery" },
};
export async function transitionAgent(taskId: string, agentId: string, action: "heading" | "arrived" | "pickup" | "out") {
  const client = await pool.connect(); try { await client.query("BEGIN"); const task = await taskRow(client,taskId,true); if (!task || task.agentId !== agentId || task.assignmentStatus !== "active") throw new CommerceError("DELIVERY_NOT_FOUND", "Active agent delivery not found", 404); const rule = transitions[action]!; if (!rule.from.includes(task.status as DeliveryStatus)) throw new CommerceError("INVALID_DELIVERY_TRANSITION", `Cannot transition from ${task.status}`, 409); const timestamp = action === "pickup" ? ",picked_up_at=NOW()" : ""; await client.query(`UPDATE delivery_tasks SET status=$2,updated_at=NOW()${timestamp} WHERE id=$1`, [taskId,rule.to]); await client.query("INSERT INTO delivery_status_history(delivery_task_id,from_status,to_status,actor_type,actor_id) VALUES($1,$2,$3,'agent',$4)",[taskId,task.status,rule.to,agentId]); const result = await taskRow(client,taskId); await client.query("COMMIT"); publishDeliveryEvent("delivery:status_updated", { taskId, orderId: result?.customerOrderId, agentId, status: rule.to }); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function complete(taskId: string, agentId: string) {
  const client = await pool.connect(); try { await client.query("BEGIN"); const task = await taskRow(client,taskId,true); if (!task || task.agentId !== agentId || task.assignmentStatus !== "active") throw new CommerceError("DELIVERY_NOT_FOUND", "Active agent delivery not found", 404); if (task.status !== "out_for_delivery") throw new CommerceError("INVALID_DELIVERY_TRANSITION", `Cannot deliver from ${task.status}`, 409); await client.query("UPDATE delivery_tasks SET status='delivered',delivered_at=NOW(),updated_at=NOW() WHERE id=$1", [taskId]); await client.query("UPDATE delivery_assignments SET status='closed',closed_at=NOW() WHERE id=$1", [task.assignmentId]); await client.query("UPDATE delivery_agents SET availability='available',updated_at=NOW() WHERE id=$1", [agentId]); await client.query("INSERT INTO delivery_status_history(delivery_task_id,from_status,to_status,actor_type,actor_id) VALUES($1,'out_for_delivery','delivered','agent',$2)",[taskId,agentId]); const store = (await client.query<{id:string;customer_order_id:string;status:string}>("SELECT id::text,customer_order_id::text,status FROM store_orders WHERE id=$1 FOR UPDATE",[task.storeOrderId])).rows[0]; if (!store) throw new CommerceError("STORE_ORDER_NOT_FOUND", "Store order not found", 409); if (store.status !== "delivered") { await client.query("UPDATE store_orders SET status='delivered',updated_at=NOW() WHERE id=$1",[store.id]); await client.query("INSERT INTO store_order_status_history(store_order_id,from_status,to_status,note) VALUES($1,$2,'delivered','Delivery completed')",[store.id,store.status]); } const previousParent = (await client.query<{status:string}>("SELECT status FROM customer_orders WHERE id=$1",[store.customer_order_id])).rows[0]?.status; const nextParent = await deriveParentOrderStatus(client,store.customer_order_id); if (previousParent !== nextParent) await client.query("INSERT INTO order_status_history(customer_order_id,from_status,to_status,note) VALUES($1,$2,$3,'Delivery completed')",[store.customer_order_id,previousParent,nextParent]); const result = await taskRow(client,taskId); await client.query("COMMIT"); publishDeliveryEvent("delivery:completed", { taskId, orderId: result?.customerOrderId, agentId, status: "delivered" }); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function fail(taskId: string, agentId: string, reason: string) {
  const client = await pool.connect(); try { await client.query("BEGIN"); const task = await taskRow(client,taskId,true); if (!task || task.agentId !== agentId || task.assignmentStatus !== "active") throw new CommerceError("DELIVERY_NOT_FOUND", "Active agent delivery not found", 404); if (["delivered","cancelled"].includes(task.status)) throw new CommerceError("INVALID_DELIVERY_TRANSITION", "Delivery is already terminal", 409); await client.query("UPDATE delivery_tasks SET status='delivery_failed',failure_reason=$2,failed_at=NOW(),updated_at=NOW() WHERE id=$1", [taskId,reason]); await client.query("UPDATE delivery_assignments SET status='closed',closed_at=NOW() WHERE id=$1", [task.assignmentId]); await client.query("UPDATE delivery_agents SET availability='available',updated_at=NOW() WHERE id=$1", [agentId]); await client.query("INSERT INTO delivery_status_history(delivery_task_id,from_status,to_status,actor_type,actor_id,note) VALUES($1,$2,'delivery_failed','agent',$3,$4)",[taskId,task.status,agentId,reason]); const result = await taskRow(client,taskId); await client.query("COMMIT"); publishDeliveryEvent("delivery:failed", { taskId, orderId: result?.customerOrderId, agentId, status: "delivery_failed" }); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function agentTasks(agentId: string) { return (await pool.query("SELECT dt.id::text,dt.task_number AS \"taskNumber\",dt.status,dt.store_order_id::text AS \"storeOrderId\",dt.customer_order_id::text AS \"customerOrderId\",dt.created_at AS \"createdAt\" FROM delivery_tasks dt JOIN delivery_assignments a ON a.delivery_task_id=dt.id WHERE a.agent_id=$1 AND a.status='active' ORDER BY dt.created_at DESC",[agentId])).rows; }
export async function customerTasks(sessionId: string, orderId: string) { return (await pool.query(`SELECT dt.id::text,dt.task_number AS "taskNumber",dt.status,dt.failure_reason AS "failureReason",dt.assigned_at AS "assignedAt",dt.picked_up_at AS "pickedUpAt",dt.delivered_at AS "deliveredAt",s.name AS "storeName",l.latitude::float8,l.longitude::float8,l.accuracy_meters::float8 AS "accuracyMeters",l.captured_at AS "capturedAt",l.received_at AS "receivedAt",(l.received_at >= NOW()-($3::text||' seconds')::interval) AS "locationFresh" FROM delivery_tasks dt JOIN customer_orders o ON o.id=dt.customer_order_id JOIN store_orders so ON so.id=dt.store_order_id JOIN stores s ON s.id=so.store_id LEFT JOIN delivery_task_locations l ON l.delivery_task_id=dt.id WHERE dt.customer_order_id=$1 AND o.session_id=$2 ORDER BY dt.id`,[orderId,sessionId,env.DELIVERY_LOCATION_MAX_AGE_SECONDS])).rows; }
export async function customerTracking(sessionId: string, taskId: string) { return (await pool.query(`SELECT dt.id::text,dt.task_number AS "taskNumber",dt.status,dt.failure_reason AS "failureReason",dt.assigned_at AS "assignedAt",dt.picked_up_at AS "pickedUpAt",dt.delivered_at AS "deliveredAt",l.latitude::float8,l.longitude::float8,l.accuracy_meters::float8 AS "accuracyMeters",l.captured_at AS "capturedAt",l.received_at AS "receivedAt",(l.received_at >= NOW()-($3::text||' seconds')::interval) AS "locationFresh" FROM delivery_tasks dt JOIN customer_orders o ON o.id=dt.customer_order_id LEFT JOIN delivery_task_locations l ON l.delivery_task_id=dt.id WHERE dt.id=$1 AND o.session_id=$2`,[taskId,sessionId,env.DELIVERY_LOCATION_MAX_AGE_SECONDS])).rows[0] ?? null; }
export async function updateLocation(taskId: string, agentId: string, input: { latitude: number; longitude: number; accuracyMeters: number; headingDegrees?: number | null; speedMps?: number | null; capturedAt: string }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = (await client.query<{ status: string; agent_id: string; customer_order_id: string; captured_at: Date | null; received_at: Date | null }>(`SELECT dt.status,a.agent_id::text,dt.customer_order_id::text,l.captured_at,l.received_at FROM delivery_tasks dt JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' LEFT JOIN delivery_task_locations l ON l.delivery_task_id=dt.id WHERE dt.id=$1 FOR UPDATE OF dt,a`, [taskId])).rows[0];
    if (!task || task.agent_id !== agentId) throw new CommerceError("DELIVERY_NOT_FOUND", "Active agent delivery not found", 404);
    if (!["assigned", "heading_to_store", "arrived_at_store", "picked_up", "out_for_delivery"].includes(task.status)) throw new CommerceError("LOCATION_NOT_ALLOWED", "Location updates are not allowed for this delivery state", 409);
    const captured = new Date(input.capturedAt), now = Date.now();
    if (captured.getTime() > now + env.DELIVERY_LOCATION_MAX_CLOCK_SKEW_SECONDS * 1000) return { accepted: false, reason: "CLOCK_SKEW" as const };
    if (captured.getTime() < now - env.DELIVERY_LOCATION_MAX_AGE_SECONDS * 1000) return { accepted: false, reason: "STALE_TIMESTAMP" as const };
    if (task.captured_at && captured.getTime() <= new Date(task.captured_at).getTime()) return { accepted: false, reason: "OUT_OF_ORDER" as const };
    if (task.received_at && now - new Date(task.received_at).getTime() < env.DELIVERY_LOCATION_MIN_INTERVAL_SECONDS * 1000) return { accepted: false, reason: "TOO_FREQUENT" as const };
    await client.query(`INSERT INTO delivery_task_locations(delivery_task_id,agent_id,latitude,longitude,accuracy_meters,heading_degrees,speed_mps,captured_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(delivery_task_id) DO UPDATE SET agent_id=EXCLUDED.agent_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,heading_degrees=EXCLUDED.heading_degrees,speed_mps=EXCLUDED.speed_mps,captured_at=EXCLUDED.captured_at,received_at=EXCLUDED.received_at WHERE delivery_task_locations.captured_at < EXCLUDED.captured_at`, [taskId,agentId,input.latitude,input.longitude,input.accuracyMeters,input.headingDegrees ?? null,input.speedMps ?? null,captured]);
    await client.query("COMMIT");
    const receivedAt = new Date().toISOString();
    publishDeliveryEvent("delivery:location_updated", { taskId, orderId: task.customer_order_id, agentId, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters, capturedAt: captured.toISOString(), receivedAt });
    return { accepted: true, receivedAt };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function diagnostics() {
  const readyWithoutTask = (await pool.query("SELECT so.id::text AS \"storeOrderId\",so.store_id::text AS \"storeId\" FROM store_orders so LEFT JOIN delivery_tasks dt ON dt.store_order_id=so.id WHERE so.status='ready_for_pickup' AND dt.id IS NULL ORDER BY so.id")).rows;
  const assignmentMismatches = (await pool.query("SELECT dt.id::text AS \"taskId\",dt.status,COUNT(a.id)::int AS \"activeAssignments\" FROM delivery_tasks dt LEFT JOIN delivery_assignments a ON a.delivery_task_id=dt.id AND a.status='active' WHERE dt.status IN ('assigned','heading_to_store','arrived_at_store','picked_up','out_for_delivery') GROUP BY dt.id,dt.status HAVING COUNT(a.id) <> 1 ORDER BY dt.id")).rows;
  const agentAvailabilityMismatches = (await pool.query("SELECT da.id::text AS \"agentId\",da.agent_code AS \"agentCode\",da.availability,COUNT(a.id)::int AS \"activeAssignments\" FROM delivery_agents da LEFT JOIN delivery_assignments a ON a.agent_id=da.id AND a.status='active' WHERE (da.availability='on_delivery' AND a.id IS NULL) OR (da.availability <> 'on_delivery' AND a.id IS NOT NULL) GROUP BY da.id,da.agent_code,da.availability ORDER BY da.id")).rows;
  return { readyWithoutTask, assignmentMismatches, agentAvailabilityMismatches };
}
