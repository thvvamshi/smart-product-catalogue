import { env } from "../config/env.js";
import type { EtaConfig, EtaEstimate, EtaStage } from "../types/eta.types.js";
import { getDemoDeliverySettings } from "./demo-settings.service.js";
import { routeEstimate } from "./routes.provider.js";

export type EtaInput = { storeLatitude: number; storeLongitude: number; customerLatitude: number; customerLongitude: number; preparationMinutes: number; stage?: EtaStage; calculatedAt?: Date; config?: EtaConfig };

function validCoordinate(value: number, min: number, max: number) { return Number.isFinite(value) && value >= min && value <= max; }
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) { const radians = (value: number) => value * Math.PI / 180; const dLat = radians(bLat - aLat); const dLng = radians(bLng - aLng); const value = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2)); return 6371 * 2 * Math.asin(Math.sqrt(value)); }

export function calculateEta(input: EtaInput): EtaEstimate | null {
  if (!validCoordinate(input.storeLatitude, -90, 90) || !validCoordinate(input.customerLatitude, -90, 90) || !validCoordinate(input.storeLongitude, -180, 180) || !validCoordinate(input.customerLongitude, -180, 180) || !Number.isFinite(input.preparationMinutes) || input.preparationMinutes < 0) return null;
  const demo = getDemoDeliverySettings();
  const config = input.config ?? { averageSpeedKmh: demo.simulationEnabled ? demo.speedKmh : env.ETA_AVERAGE_SPEED_KMH, dispatchBufferMinutes: env.ETA_DISPATCH_BUFFER_MINUTES, uncertaintyBufferMinutes: env.ETA_UNCERTAINTY_BUFFER_MINUTES, validityMinutes: env.ETA_VALIDITY_MINUTES };
  if (!Number.isFinite(config.averageSpeedKmh) || !Number.isFinite(config.dispatchBufferMinutes) || !Number.isFinite(config.uncertaintyBufferMinutes) || !Number.isFinite(config.validityMinutes) || config.averageSpeedKmh <= 0 || config.dispatchBufferMinutes < 0 || config.uncertaintyBufferMinutes < 0 || config.validityMinutes <= 0) return null;
  const stage = input.stage ?? "pending_assignment";
  const distance = distanceKm(input.storeLatitude, input.storeLongitude, input.customerLatitude, input.customerLongitude);
  const preparation = ["picked_up", "out_for_delivery"].includes(stage) ? 0 : input.preparationMinutes;
  const dispatch = ["picked_up", "out_for_delivery"].includes(stage) ? 0 : config.dispatchBufferMinutes;
  const base = Math.max(1, preparation + dispatch + distance / config.averageSpeedKmh * 60);
  const uncertainty = config.uncertaintyBufferMinutes;
  const now = input.calculatedAt ?? new Date();
  const etaMinutes = Math.max(1, Math.round(base));
  const minEtaMinutes = Math.max(1, Math.floor(Math.max(1, base - uncertainty)));
  const maxEtaMinutes = Math.max(etaMinutes, Math.ceil(base + uncertainty));
  const estimated = new Date(now.getTime() + etaMinutes * 60_000);
  const validUntil = new Date(now.getTime() + config.validityMinutes * 60_000);
  return { etaMinutes, minEtaMinutes, maxEtaMinutes, estimatedDeliveryAt: estimated.toISOString(), etaSource: "provisional_haversine", calculatedAt: now.toISOString(), validUntil: validUntil.toISOString(), confidence: "low", metadata: { distanceKm: Number(distance.toFixed(3)), averageSpeedKmh: config.averageSpeedKmh, preparationMinutes: preparation, dispatchBufferMinutes: dispatch, uncertaintyBufferMinutes: uncertainty, stage } };
}

export async function calculateHybridEta(input: EtaInput): Promise<EtaEstimate | null> {
  const fallback = calculateEta(input);
  if (!fallback) return null;
  const route = await routeEstimate({ originLatitude: input.storeLatitude, originLongitude: input.storeLongitude, destinationLatitude: input.customerLatitude, destinationLongitude: input.customerLongitude });
  if (!route) return fallback;
  const config = input.config ?? { averageSpeedKmh: getDemoDeliverySettings().simulationEnabled ? getDemoDeliverySettings().speedKmh : env.ETA_AVERAGE_SPEED_KMH, dispatchBufferMinutes: env.ETA_DISPATCH_BUFFER_MINUTES, uncertaintyBufferMinutes: env.ETA_UNCERTAINTY_BUFFER_MINUTES, validityMinutes: env.ETA_VALIDITY_MINUTES };
  const stage = input.stage ?? "pending_assignment"; const inTransit = ["picked_up", "out_for_delivery"].includes(stage); const preparation = inTransit ? 0 : input.preparationMinutes; const dispatch = inTransit ? 0 : config.dispatchBufferMinutes;
  const base = Math.max(1, preparation + dispatch + route.durationSeconds / 60); const now = input.calculatedAt ?? new Date(); const etaMinutes = Math.max(1, Math.round(base)); const minEtaMinutes = Math.max(1, Math.floor(Math.max(1, base - config.uncertaintyBufferMinutes))); const maxEtaMinutes = Math.max(etaMinutes, Math.ceil(base + config.uncertaintyBufferMinutes));
  return { etaMinutes, minEtaMinutes, maxEtaMinutes, estimatedDeliveryAt: new Date(now.getTime() + etaMinutes * 60_000).toISOString(), etaSource: route.trafficAware ? "traffic_aware_routing" : "road_routing", calculatedAt: now.toISOString(), validUntil: new Date(now.getTime() + config.validityMinutes * 60_000).toISOString(), confidence: route.trafficAware ? "high" : "medium", metadata: { distanceKm: Number((route.distanceMeters / 1000).toFixed(3)), averageSpeedKmh: config.averageSpeedKmh, preparationMinutes: preparation, dispatchBufferMinutes: dispatch, uncertaintyBufferMinutes: config.uncertaintyBufferMinutes, stage, roadDistanceMeters: route.distanceMeters, travelDurationSeconds: route.durationSeconds, routingProvider: route.provider, trafficAware: route.trafficAware } };
}

export function overallEta(estimates: Array<{ storeId: string; estimate: EtaEstimate | null; active?: boolean }>) {
  const active = estimates.filter((item) => item.active !== false && item.estimate);
  if (!active.length) return null;
  const values = active.map((item) => item.estimate!);
  const calculatedAt = values.reduce((current, estimate) => new Date(estimate.calculatedAt).getTime() > new Date(current).getTime() ? estimate.calculatedAt : current, values[0]!.calculatedAt);
  const etaMinutes = Math.max(...values.map((estimate) => estimate.etaMinutes));
  const minEtaMinutes = Math.max(...values.map((estimate) => estimate.minEtaMinutes));
  const maxEtaMinutes = Math.max(...values.map((estimate) => estimate.maxEtaMinutes));
  const calculatedTime = new Date(calculatedAt).getTime();
  const estimatedDeliveryAt = new Date(calculatedTime + etaMinutes * 60_000).toISOString();
  const latestEstimatedDeliveryAt = new Date(calculatedTime + maxEtaMinutes * 60_000).toISOString();
  const latest = values[0]!;
  return {
    ...latest,
    calculatedAt,
    estimatedDeliveryAt,
    latestEstimatedDeliveryAt,
    etaMinutes,
    minEtaMinutes,
    maxEtaMinutes,
    storeCount: active.length,
    storeIds: active.map((item) => item.storeId),
  };
}

export function isEtaFresh(estimate: EtaEstimate, now = new Date()) {
  return new Date(estimate.validUntil).getTime() > now.getTime();
}
