import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type DeliveryEventName = "order:created" | "order:store_status_updated" | "delivery:status_updated" | "delivery:location_updated" | "delivery:assignment_changed" | "delivery:completed" | "delivery:failed";
export const deliveryEvents = new EventEmitter();
export function publishDeliveryEvent(name: DeliveryEventName, payload: Record<string, unknown>) {
  deliveryEvents.emit(name, { eventId: randomUUID(), serverTimestamp: new Date().toISOString(), ...payload });
}
