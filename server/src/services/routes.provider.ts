import { env } from "../config/env.js";

export type RouteEstimate = { distanceMeters: number; durationSeconds: number; trafficAware: boolean; provider: "google"; calculatedAt: string };
export type RouteInput = { originLatitude: number; originLongitude: number; destinationLatitude: number; destinationLongitude: number };

const cache = new Map<string, { value: RouteEstimate; expiresAt: number }>();
const valid = (latitude: number, longitude: number) => Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
const seconds = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?s$/.test(value) ? Number(value.slice(0, -1)) : NaN;

export async function routeEstimate(input: RouteInput): Promise<RouteEstimate | null> {
  if (env.ROUTES_PROVIDER !== "google" || !env.GOOGLE_MAPS_API_KEY || !valid(input.originLatitude, input.originLongitude) || !valid(input.destinationLatitude, input.destinationLongitude)) return null;
  const key = `${input.originLatitude.toFixed(4)},${input.originLongitude.toFixed(4)}:${input.destinationLatitude.toFixed(4)},${input.destinationLongitude.toFixed(4)}:DRIVE:TRAFFIC_AWARE`;
  const cached = cache.get(key); if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), env.ROUTES_TIMEOUT_MS);
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration" }, body: JSON.stringify({ origin: { location: { latLng: { latitude: input.originLatitude, longitude: input.originLongitude } } }, destination: { location: { latLng: { latitude: input.destinationLatitude, longitude: input.destinationLongitude } } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }) });
    if (!response.ok) return null;
    const route = ((await response.json()) as { routes?: Array<{ distanceMeters?: number; duration?: string; staticDuration?: string }> }).routes?.[0];
    const duration = seconds(route?.duration); const staticDuration = seconds(route?.staticDuration); const distanceMeters = route?.distanceMeters;
    if (!Number.isFinite(distanceMeters) || distanceMeters! <= 0 || !Number.isFinite(duration) || duration <= 0) return null;
    const value: RouteEstimate = { distanceMeters: distanceMeters!, durationSeconds: duration, trafficAware: Number.isFinite(staticDuration) && Math.abs(duration - staticDuration) > 0.5, provider: "google", calculatedAt: new Date().toISOString() };
    cache.set(key, { value, expiresAt: Date.now() + 120_000 }); return value;
  } catch { return null; } finally { clearTimeout(timer); }
}
