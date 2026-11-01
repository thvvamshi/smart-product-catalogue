import { describe, expect, it } from "vitest";
import { deliveryProgress } from "../lib/delivery-progress";

describe("deliveryProgress", () => {
  it.each([
    ["picked_up", "On the way"],
    ["out_for_delivery", "On the way"],
    ["delivered", "Delivered"],
    ["delivery_failed", "Delivery failed"],
  ])("uses an authoritative delivery task state (%s)", (delivery, label) => {
    const result = deliveryProgress("ready_for_pickup", delivery);
    expect(result.label).toBe(label);
    expect(result.status).toBe(delivery);
  });

  it("does not regress a picked-up fulfilment to ready for pickup", () => {
    expect(deliveryProgress("ready_for_pickup", "picked_up").label).not.toBe("Ready for pickup");
  });
});
