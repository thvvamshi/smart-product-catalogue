import { env } from "../config/env.js";

export type DemoDeliverySettings = {
  simulationEnabled: boolean;
  speedKmh: number;
  tickIntervalMs: number;
  preparationDurationSeconds: number;
};

let settings: DemoDeliverySettings = {
  simulationEnabled: env.DEMO_DELIVERY_SIMULATION_ENABLED,
  speedKmh: env.DEMO_DELIVERY_SPEED_KMH,
  tickIntervalMs: env.DEMO_DELIVERY_TICK_INTERVAL_MS,
  preparationDurationSeconds: env.DEMO_DELIVERY_PREPARATION_DURATION_SECONDS,
};

export function getDemoDeliverySettings(): DemoDeliverySettings { return { ...settings }; }

export function updateDemoDeliverySettings(input: Partial<DemoDeliverySettings>): DemoDeliverySettings {
  const next = { ...settings, ...input };
  if (!Number.isFinite(next.speedKmh) || next.speedKmh < 1 || next.speedKmh > 100) throw new Error("speedKmh must be between 1 and 100");
  if (!Number.isFinite(next.tickIntervalMs) || next.tickIntervalMs < 1000 || next.tickIntervalMs > 300000) throw new Error("tickIntervalMs must be between 1000 and 300000");
  if (!Number.isFinite(next.preparationDurationSeconds) || next.preparationDurationSeconds < 1 || next.preparationDurationSeconds > 3600) throw new Error("preparationDurationSeconds must be between 1 and 3600");
  settings = next;
  return getDemoDeliverySettings();
}
