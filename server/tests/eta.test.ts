import { describe, expect, it } from "vitest";
import { calculateEta, isEtaFresh, overallEta } from "../src/services/eta.service.js";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const config = { averageSpeedKmh: 20, dispatchBufferMinutes: 5, uncertaintyBufferMinutes: 5, validityMinutes: 10 };
const calculatedAt = new Date("2026-01-01T00:00:00.000Z");

describe("ETA calculation foundation", () => {
  it("persists checkout, reservation, and order ETA snapshots", async () => {
    const session = `eta_persist_${Date.now()}`;
    const source = (await pool.query<{ variant: string; store: string; price: string }>(`SELECT i.variant_id::text AS variant,i.store_id::text AS store,i.selling_price::text AS price FROM store_inventory i WHERE i.stock_quantity > 2 AND i.is_available LIMIT 1`)).rows[0]!;
    const address = (await pool.query<{ id: string }>(`INSERT INTO customer_addresses(session_id,label,recipient_name,phone,address_line1,city,state,postal_code,latitude,longitude,is_default) SELECT $1,'Home','ETA Test','9876543210','Demo','Hyderabad','Telangana','500032',s.latitude,s.longitude,TRUE FROM stores s WHERE s.id=$2 RETURNING id::text`, [session, source.store])).rows[0]!;
    await pool.query(`INSERT INTO carts(session_id) VALUES($1)`, [session]);
    const cart = (await pool.query<{ id: string }>(`SELECT id::text FROM carts WHERE session_id=$1`, [session])).rows[0]!;
    await pool.query(`INSERT INTO cart_items(cart_id,variant_id,store_id,quantity,unit_price_snapshot) VALUES($1,$2,$3,1,$4)`, [cart.id, source.variant, source.store, source.price]);
    const reservation = await request(app).post("/api/checkout/reservations").set("X-Cart-Session", session).set("Idempotency-Key", "eta-persist-1").send({ addressId: address.id });
    expect(reservation.status).toBe(201);
    const reservationId = reservation.body.data.id as string;
    const counts = await pool.query<{ stage: string; count: string }>(`SELECT stage,COUNT(*)::text AS count FROM eta_snapshots WHERE reservation_id=$1 OR checkout_attempt_id=(SELECT checkout_attempt_id FROM inventory_reservations WHERE id=$1) GROUP BY stage ORDER BY stage`, [reservationId]);
    expect(counts.rows.map((row) => row.stage)).toEqual(["checkout", "reservation"]);
    const order = await request(app).post("/api/orders").set("X-Cart-Session", session).set("Idempotency-Key", "eta-order-1").send({ reservationId });
    expect(order.status).toBe(201);
    expect(order.body.data.storeOrders[0].eta).toBeTruthy();
    expect((await pool.query(`SELECT COUNT(*) FROM eta_snapshots WHERE customer_order_id=$1 AND stage='order'`, [order.body.data.id])).rows[0].count).toBe("2");
  });

  it("calculates a deterministic provisional ETA for a store", () => {
    const estimate = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.45, customerLongitude: 78.36, preparationMinutes: 10, config, calculatedAt });
    expect(estimate).not.toBeNull();
    expect(estimate?.etaSource).toBe("provisional_haversine");
    expect(estimate?.minEtaMinutes).toBeLessThanOrEqual(estimate!.etaMinutes);
    expect(estimate?.etaMinutes).toBeLessThanOrEqual(estimate!.maxEtaMinutes);
    expect(estimate?.calculatedAt).toBe(calculatedAt.toISOString());
    expect(estimate?.validUntil).toBe("2026-01-01T00:10:00.000Z");
  });

  it("responds to preparation time and distance changes", () => {
    const near = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.44, customerLongitude: 78.35, preparationMinutes: 5, config, calculatedAt })!;
    const farther = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.54, customerLongitude: 78.45, preparationMinutes: 5, config, calculatedAt })!;
    const longerPrep = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.44, customerLongitude: 78.35, preparationMinutes: 20, config, calculatedAt })!;
    expect(farther.etaMinutes).toBeGreaterThan(near.etaMinutes);
    expect(longerPrep.etaMinutes).toBeGreaterThan(near.etaMinutes);
  });

  it("uses the maximum active store ETA for the overall estimate", () => {
    const first = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.44, customerLongitude: 78.35, preparationMinutes: 5, config, calculatedAt })!;
    const second = calculateEta({ storeLatitude: 17.44, storeLongitude: 78.35, customerLatitude: 17.54, customerLongitude: 78.45, preparationMinutes: 20, config, calculatedAt })!;
    const overall = overallEta([{ storeId: "1", estimate: first }, { storeId: "2", estimate: second }, { storeId: "3", estimate: first, active: false }]);
    expect(overall?.etaMinutes).toBe(second.etaMinutes);
    expect(overall?.latestEstimatedDeliveryAt).toBe(new Date(new Date(overall!.calculatedAt).getTime() + overall!.maxEtaMinutes * 60_000).toISOString());
    expect(overall?.estimatedDeliveryAt).toBe(new Date(new Date(overall!.calculatedAt).getTime() + overall!.etaMinutes * 60_000).toISOString());
    expect(overall?.storeCount).toBe(2);
    expect(overall?.storeIds).toEqual(["1", "2"]);
  });

  it("returns null for unavailable inputs and detects stale estimates", () => {
    expect(calculateEta({ storeLatitude: Number.NaN, storeLongitude: 78, customerLatitude: 17, customerLongitude: 78, preparationMinutes: 5, config, calculatedAt })).toBeNull();
    expect(calculateEta({ storeLatitude: 17, storeLongitude: 78, customerLatitude: 17, customerLongitude: 78, preparationMinutes: -1, config, calculatedAt })).toBeNull();
    const estimate = calculateEta({ storeLatitude: 17, storeLongitude: 78, customerLatitude: 17, customerLongitude: 78, preparationMinutes: 5, config, calculatedAt })!;
    expect(isEtaFresh(estimate, new Date("2026-01-01T00:09:59.000Z"))).toBe(true);
    expect(isEtaFresh(estimate, new Date("2026-01-01T00:10:00.000Z"))).toBe(false);
  });

  it("rejects non-finite and unsafe runtime configuration", () => {
    const input = { storeLatitude: 17, storeLongitude: 78, customerLatitude: 17, customerLongitude: 78, preparationMinutes: 5, calculatedAt };
    expect(calculateEta({ ...input, config: { ...config, averageSpeedKmh: Number.NaN } })).toBeNull();
    expect(calculateEta({ ...input, config: { ...config, dispatchBufferMinutes: Number.POSITIVE_INFINITY } })).toBeNull();
    expect(calculateEta({ ...input, config: { ...config, uncertaintyBufferMinutes: -1 } })).toBeNull();
    expect(calculateEta({ ...input, config: { ...config, validityMinutes: 0 } })).toBeNull();
  });
});
