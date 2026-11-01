import type { PoolClient } from "pg";
import type { StoreOrderStatus } from "../types/order.types.js";

export async function deriveParentOrderStatus(client: PoolClient, customerOrderId: string) {
  const rows = (await client.query<{ status: StoreOrderStatus }>("SELECT status FROM store_orders WHERE customer_order_id=$1", [customerOrderId])).rows;
  const statuses = rows.map((row) => row.status);
  const accepted = statuses.filter((status) => ["accepted", "preparing", "ready_for_pickup", "delivered"].includes(status)).length;
  const delivered = statuses.filter((status) => status === "delivered").length;
  const rejected = statuses.filter((status) => status === "rejected").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  const pending = statuses.filter((status) => status === "pending_acceptance").length;
  let status = "placed";
  if (delivered === statuses.length && statuses.length > 0) status = "completed";
  else if (rejected + cancelled === statuses.length && statuses.length > 0) status = rejected > 0 ? "rejected" : "cancelled";
  else if (rejected > 0 || cancelled > 0) status = "partially_rejected";
  else if (accepted > 0 && pending > 0) status = "partially_accepted";
  else if (accepted === statuses.length && accepted > 0) status = "confirmed";
  else if (pending === statuses.length) status = "placed";
  await client.query("UPDATE customer_orders SET status=$2,updated_at=NOW() WHERE id=$1 AND status<>$2", [customerOrderId, status]);
  return status;
}
