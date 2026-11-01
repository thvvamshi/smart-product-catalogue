import type { PoolClient } from "pg";
import type { EtaEstimate } from "../types/eta.types.js";

type EstimateGroup = { storeId: string; eta: EtaEstimate | null };
type SnapshotStage = "checkout" | "reservation" | "order" | "delivery";

function snapshotValues(stage: SnapshotStage, scope: "store" | "overall", estimate: EtaEstimate, refs: { checkoutAttemptId?: string; reservationId?: string; customerOrderId?: string; storeOrderId?: string; storeId?: string }) {
  return [stage, scope, refs.checkoutAttemptId ?? null, refs.reservationId ?? null, refs.customerOrderId ?? null, refs.storeOrderId ?? null, refs.storeId ?? null, estimate.etaMinutes, estimate.minEtaMinutes, estimate.maxEtaMinutes, estimate.estimatedDeliveryAt, estimate.latestEstimatedDeliveryAt ?? null, estimate.calculatedAt, estimate.validUntil, estimate.etaSource, "haversine-v1", JSON.stringify({ averageSpeedKmh: estimate.metadata.averageSpeedKmh, dispatchBufferMinutes: estimate.metadata.dispatchBufferMinutes, uncertaintyBufferMinutes: estimate.metadata.uncertaintyBufferMinutes, validityMinutes: Math.max(0, (Date.parse(estimate.validUntil) - Date.parse(estimate.calculatedAt)) / 60000) }), JSON.stringify({ distanceKm: estimate.metadata.distanceKm, preparationMinutes: estimate.metadata.preparationMinutes, stage: estimate.metadata.stage })];
}

export async function insertSnapshots(client: PoolClient, stage: SnapshotStage, refs: { checkoutAttemptId?: string; reservationId?: string; customerOrderId?: string; storeOrderIdByStore?: Map<string, string> }, groups: EstimateGroup[], overall: EtaEstimate | null) {
  const sql = `INSERT INTO eta_snapshots(stage,scope,checkout_attempt_id,reservation_id,customer_order_id,store_order_id,store_id,eta_minutes,min_eta_minutes,max_eta_minutes,estimated_delivery_at,latest_estimated_delivery_at,calculated_at,valid_until,eta_source,algorithm_version,config_snapshot,input_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`;
  for (const group of groups) {
    if (!group.eta) continue;
    await client.query(sql, snapshotValues(stage, "store", group.eta, { checkoutAttemptId: refs.checkoutAttemptId, reservationId: refs.reservationId, customerOrderId: refs.customerOrderId, storeOrderId: refs.storeOrderIdByStore?.get(group.storeId), storeId: group.storeId }));
  }
  if (overall) await client.query(sql, snapshotValues(stage, "overall", overall, { checkoutAttemptId: refs.checkoutAttemptId, reservationId: refs.reservationId, customerOrderId: refs.customerOrderId }));
}

export async function reservationEstimates(client: PoolClient, reservationId: string) {
  return (await client.query(`SELECT scope,store_id::text AS "storeId",eta_minutes AS "etaMinutes",min_eta_minutes AS "minEtaMinutes",max_eta_minutes AS "maxEtaMinutes",estimated_delivery_at AS "estimatedDeliveryAt",latest_estimated_delivery_at AS "latestEstimatedDeliveryAt",calculated_at AS "calculatedAt",valid_until AS "validUntil",eta_source AS "etaSource",algorithm_version AS "algorithmVersion",config_snapshot AS "configSnapshot",input_snapshot AS "inputSnapshot" FROM eta_snapshots WHERE reservation_id=$1 AND stage='reservation' ORDER BY scope,store_id`, [reservationId])).rows;
}

export async function orderEstimate(client: PoolClient, storeOrderId: string) {
  return (await client.query(`SELECT scope,store_id::text AS "storeId",eta_minutes AS "etaMinutes",min_eta_minutes AS "minEtaMinutes",max_eta_minutes AS "maxEtaMinutes",estimated_delivery_at AS "estimatedDeliveryAt",latest_estimated_delivery_at AS "latestEstimatedDeliveryAt",calculated_at AS "calculatedAt",valid_until AS "validUntil",eta_source AS "etaSource",algorithm_version AS "algorithmVersion",config_snapshot AS "configSnapshot",input_snapshot AS "inputSnapshot" FROM eta_snapshots WHERE store_order_id=$1 AND stage='order' ORDER BY scope`, [storeOrderId])).rows;
}

export async function copyReservationToOrder(client: PoolClient, reservationId: string, customerOrderId: string, storeOrderByStore: Map<string, string>) {
  for (const [storeId, storeOrderId] of storeOrderByStore) {
    await client.query(`INSERT INTO eta_snapshots(stage,scope,checkout_attempt_id,reservation_id,customer_order_id,store_order_id,store_id,eta_minutes,min_eta_minutes,max_eta_minutes,estimated_delivery_at,latest_estimated_delivery_at,calculated_at,valid_until,eta_source,algorithm_version,config_snapshot,input_snapshot) SELECT 'order','store',checkout_attempt_id,reservation_id,$2,$3,store_id,eta_minutes,min_eta_minutes,max_eta_minutes,estimated_delivery_at,latest_estimated_delivery_at,calculated_at,valid_until,eta_source,algorithm_version,config_snapshot,input_snapshot FROM eta_snapshots WHERE reservation_id=$1 AND stage='reservation' AND scope='store' AND store_id=$4 ON CONFLICT DO NOTHING`, [reservationId, customerOrderId, storeOrderId, storeId]);
  }
  await client.query(`INSERT INTO eta_snapshots(stage,scope,checkout_attempt_id,reservation_id,customer_order_id,eta_minutes,min_eta_minutes,max_eta_minutes,estimated_delivery_at,latest_estimated_delivery_at,calculated_at,valid_until,eta_source,algorithm_version,config_snapshot,input_snapshot) SELECT 'order','overall',checkout_attempt_id,reservation_id,$2,eta_minutes,min_eta_minutes,max_eta_minutes,estimated_delivery_at,latest_estimated_delivery_at,calculated_at,valid_until,eta_source,algorithm_version,config_snapshot,input_snapshot FROM eta_snapshots WHERE reservation_id=$1 AND stage='reservation' AND scope='overall' ON CONFLICT DO NOTHING`, [reservationId, customerOrderId]);
}
