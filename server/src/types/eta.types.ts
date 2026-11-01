export type EtaSource = "provisional_haversine" | "road_routing" | "traffic_aware_routing";
export type EtaConfidence = "low" | "medium" | "high";
export type EtaStage = "pending_assignment" | "assigned" | "heading_to_store" | "arrived_at_store" | "picked_up" | "out_for_delivery";
export type EtaConfig = { averageSpeedKmh: number; dispatchBufferMinutes: number; uncertaintyBufferMinutes: number; validityMinutes: number };
export type EtaEstimate = { etaMinutes: number; minEtaMinutes: number; maxEtaMinutes: number; estimatedDeliveryAt: string; latestEstimatedDeliveryAt?: string; etaSource: EtaSource; calculatedAt: string; validUntil: string; confidence: EtaConfidence; metadata: { distanceKm: number; averageSpeedKmh: number; preparationMinutes: number; dispatchBufferMinutes: number; uncertaintyBufferMinutes: number; stage: EtaStage; roadDistanceMeters?: number; travelDurationSeconds?: number; routingProvider?: string; trafficAware?: boolean } };
