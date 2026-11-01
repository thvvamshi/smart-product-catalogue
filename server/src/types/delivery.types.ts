export type DeliveryStatus = "pending_assignment" | "assigned" | "heading_to_store" | "arrived_at_store" | "picked_up" | "out_for_delivery" | "delivered" | "delivery_failed" | "cancelled";
export type AgentStatus = "active" | "inactive" | "suspended";
export type AgentAvailability = "available" | "unavailable" | "on_delivery";
export type DeliveryActor = "admin" | "dispatcher" | "agent" | "system";
