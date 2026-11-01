import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import { expireReservations } from "../src/models/checkout.model.js";
const session = (name: string) => `phase3_session_${name.padEnd(16, "x")}`;
const headers = (name: string) => ({ "X-Cart-Session": session(name) });
let variantA: string, variantB: string, storeA: string, storeB: string;
async function address(name: string, lat = 17.4401, lng = 78.3489) {
  const response = await request(app)
    .post("/api/addresses")
    .set(headers(name))
    .send({
      label: "Home",
      recipientName: "Test Customer",
      phone: "9876543210",
      addressLine1: "Demo address",
      addressLine2: "",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500032",
      latitude: lat,
      longitude: lng,
      isDefault: true,
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}
async function add(
  name: string,
  variantId = variantA,
  storeId = storeA,
  quantity = 1,
) {
  return request(app)
    .post("/api/cart/items")
    .set(headers(name))
    .send({ variantId, storeId, quantity });
}
async function reserve(
  name: string,
  addressId: string,
  key = `key_${name.padEnd(8, "x")}`,
) {
  return request(app)
    .post("/api/checkout/reservations")
    .set(headers(name))
    .set("Idempotency-Key", key)
    .send({ addressId });
}
async function place(
  name: string,
  addressId: string,
  key = `place_${name.padEnd(8, "x")}`,
) {
  return request(app)
    .post("/api/checkout/place-order")
    .set(headers(name))
    .set("Idempotency-Key", key)
    .send({ addressId });
}
beforeEach(async () => {
  await pool.query(
    "TRUNCATE delivery_status_history,delivery_assignments,delivery_tasks,delivery_agents,delivery_dispatchers,order_inventory_adjustments,order_items,store_order_status_history,order_status_history,store_orders,customer_orders,store_operators,inventory_reservation_items,inventory_reservations,checkout_attempts,cart_items,carts,customer_addresses RESTART IDENTITY CASCADE",
  );
  await pool.query("UPDATE stores SET is_active=TRUE WHERE store_code IN('HYD-GAC-001','HYD-MAD-001')");
  await pool.query("UPDATE product_variants SET is_active=TRUE WHERE sku IN('FASH-TEST-BLK-M','FASH-TEST-IVR-M')");
  const rows = await pool.query<{
    variant_id: string;
    store_id: string;
    sku: string;
  }>(
    `SELECT v.id::text variant_id,s.id::text store_id,v.sku FROM product_variants v JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id WHERE v.sku IN('FASH-TEST-BLK-M','FASH-TEST-IVR-M') AND s.store_code IN('HYD-GAC-001','HYD-MAD-001') ORDER BY v.sku,s.store_code`,
  );
  variantA = rows.rows.find((r) => r.sku === "FASH-TEST-BLK-M")!.variant_id;
  variantB = rows.rows.find((r) => r.sku === "FASH-TEST-IVR-M")!.variant_id;
  storeA = rows.rows.find((r) => r.sku === "FASH-TEST-BLK-M")!.store_id;
  storeB =
    rows.rows.find((r) => r.sku === "FASH-TEST-IVR-M" && r.store_id !== storeA)
      ?.store_id ??
    rows.rows.find((r) => r.sku === "FASH-TEST-IVR-M")!.store_id;
  await pool.query(
    `UPDATE store_inventory SET stock_quantity=4,is_available=TRUE,selling_price=CASE WHEN store_id=$1 THEN 949 ELSE 999 END WHERE variant_id IN($2,$3)`,
    [storeA, variantA, variantB],
  );
});
describe("multi-store cart", () => {
  it("enforces cart and reservation database constraints", async () => {
    await add("constraints");
    const cartId=(await pool.query<{id:string}>("SELECT id::text FROM carts WHERE session_id=$1",[session("constraints")])).rows[0]!.id;
    await expect(pool.query("UPDATE cart_items SET quantity=-1 WHERE cart_id=$1",[cartId])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("INSERT INTO carts(session_id) VALUES($1)",[session("constraints")])).rejects.toMatchObject({code:"23505"});
  });
  it("requires a protected guest session", async () =>
    expect((await request(app).get("/api/cart")).status).toBe(400));
  it("creates one cart, adds exact variants without reserving, and groups stores", async () => {
    const before = Number(
      (
        await pool.query(
          `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
          [storeA, variantA],
        )
      ).rows[0].stock_quantity,
    );
    expect((await add("cart", variantA, storeA, 1)).status).toBe(201);
    expect((await add("cart", variantB, storeB, 2)).status).toBe(201);
    const cart = await request(app).get("/api/cart").set(headers("cart"));
    expect(cart.body.data.groups).toHaveLength(storeA === storeB ? 1 : 2);
    expect(cart.body.data.itemCount).toBe(3);
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(before);
  });
  it("returns independent store ETAs and an overall maximum ETA for a selected location", async () => {
    await add("cart-eta", variantA, storeA);
    await add("cart-eta", variantB, storeB);
    const response = await request(app).get("/api/cart/eta").set(headers("cart-eta")).query({ latitude: 17.4401, longitude: 78.3489 });
    expect(response.status).toBe(200);
    expect(response.body.data.groups.length).toBe(storeA === storeB ? 1 : 2);
    expect(response.body.data.eta.maxEtaMinutes).toBe(Math.max(...response.body.data.groups.map((group: { eta: { maxEtaMinutes: number } }) => group.eta.maxEtaMinutes)));
    const outsideCoverage = await request(app).get("/api/cart/eta").set(headers("cart-eta")).query({ latitude: 28.6139, longitude: 77.209 });
    expect(outsideCoverage.body.data.eta).toBeNull();
  });
  it("merges duplicate variants only at the same explicit store", async () => {
    await add("duplicate");
    const merged = await add("duplicate");
    expect(merged.body.data.itemCount).toBe(2);
    const conflict = await add("duplicate", variantA, storeB);
    if (storeB !== storeA) {
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe("STORE_CONFLICT");
    }
  });
  it("updates, removes, clears, and enforces ownership", async () => {
    const created = await add("owner");
    const id = created.body.data.groups[0].items[0].id;
    expect(
      (
        await request(app)
          .patch(`/api/cart/items/${id}`)
          .set(headers("other"))
          .send({ quantity: 2 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/cart/items/${id}`)
          .set(headers("owner"))
          .send({ quantity: 2 })
      ).body.data.itemCount,
    ).toBe(2);
    expect(
      (await request(app).delete(`/api/cart/items/${id}`).set(headers("owner")))
        .body.data.itemCount,
    ).toBe(0);
    await add("owner");
    expect(
      (await request(app).delete("/api/cart").set(headers("owner"))).body.data
        .itemCount,
    ).toBe(0);
  });
  it("rejects invalid and inactive inventory", async () => {
    expect((await add("invalid", "999999", storeA)).status).toBe(409);
    await pool.query("UPDATE stores SET is_active=FALSE WHERE id=$1", [storeA]);
    expect((await add("inactive", variantA, storeA)).status).toBe(409);
  });
});
describe("checkout validation", () => {
  it("rejects empty carts and foreign addresses", async () => {
    const id = await address("address-owner");
    expect(
      (
        await request(app)
          .post("/api/checkout/validate")
          .set(headers("empty"))
          .send({ addressId: id })
      ).status,
    ).toBe(404);
    await add("empty");
    expect(
      (
        await request(app)
          .post("/api/checkout/validate")
          .set(headers("empty"))
          .send({ addressId: id })
      ).status,
    ).toBe(404);
  });
  it("returns multi-store groups and price changes without reserving", async () => {
    const id = await address("validate");
    await add("validate", variantA, storeA);
    await add("validate", variantB, storeB);
    await pool.query(
      `UPDATE store_inventory SET selling_price=selling_price+10 WHERE store_id=$1 AND variant_id=$2`,
      [storeA, variantA],
    );
    const response = await request(app)
      .post("/api/checkout/validate")
      .set(headers("validate"))
      .send({ addressId: id });
    expect(response.status).toBe(200);
    expect(response.body.data.valid).toBe(false);
    expect(
      response.body.data.issues.map((x: { code: string }) => x.code),
    ).toContain("PRICE_CHANGED");
    expect(response.body.data.deliveryFee).toBeNull();
  });
  it("reports unserviceable stores as business issues", async () => {
    const id = await address("far", 28.6139, 77.209);
    await add("far");
    const result = await request(app)
      .post("/api/checkout/validate")
      .set(headers("far"))
      .send({ addressId: id });
    expect(
      result.body.data.issues.map((x: { code: string }) => x.code),
    ).toContain("STORE_NOT_SERVICEABLE");
  });
  it("reports inactive variants and stores without removing cart lines",async()=>{const id=await address("inactive-checkout");await add("inactive-checkout");await pool.query("UPDATE product_variants SET is_active=FALSE WHERE id=$1",[variantA]);await pool.query("UPDATE stores SET is_active=FALSE WHERE id=$1",[storeA]);const result=await request(app).post("/api/checkout/validate").set(headers("inactive-checkout")).send({addressId:id});expect(result.body.data.issues.map((issue:{code:string})=>issue.code)).toEqual(expect.arrayContaining(["VARIANT_INACTIVE","STORE_INACTIVE"]));expect((await request(app).get("/api/cart").set(headers("inactive-checkout"))).body.data.itemCount).toBe(1)});
});
describe("atomic inventory reservations", () => {
  it("places an order in one transaction, consumes its internal allocation, and is idempotent", async () => {
    const id = await address("one-step");
    await add("one-step", variantA, storeA);
    await add("one-step", variantB, storeB);
    const before = await pool.query<{ store_id: string; stock_quantity: number }>("SELECT store_id::text,stock_quantity FROM store_inventory WHERE (store_id=$1 AND variant_id=$2) OR (store_id=$3 AND variant_id=$4)", [storeA, variantA, storeB, variantB]);
    const first = await place("one-step", id, "place_one_step_1");
    expect(first.status).toBe(201);
    expect(first.body.data.storeOrders.length).toBe(storeA === storeB ? 1 : 2);
    expect((await request(app).get("/api/cart").set(headers("one-step"))).body.data.itemCount).toBe(0);
    const reservation = await pool.query("SELECT r.status,a.status attempt_status FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id");
    expect(reservation.rows[0]).toMatchObject({ status: "consumed", attempt_status: "completed" });
    const after = await pool.query<{ store_id: string; stock_quantity: number }>("SELECT store_id::text,stock_quantity FROM store_inventory WHERE (store_id=$1 AND variant_id=$2) OR (store_id=$3 AND variant_id=$4)", [storeA, variantA, storeB, variantB]);
    for (const row of after.rows) expect(row.stock_quantity).toBe(before.rows.find((beforeRow) => beforeRow.store_id === row.store_id)!.stock_quantity - 1);
    const retry = await place("one-step", id, "place_one_step_1");
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect((await pool.query("SELECT COUNT(*)::int count FROM customer_orders")).rows[0].count).toBe(1);
    expect(await expireReservations()).toBe(0);
  });

  it("rolls back a one-step order and leaves the cart intact when a store is unavailable", async () => {
    const id = await address("one-step-fail");
    await add("one-step-fail", variantA, storeA);
    await add("one-step-fail", variantB, storeB);
    await pool.query("UPDATE store_inventory SET stock_quantity=0 WHERE store_id=$1 AND variant_id=$2", [storeB, variantB]);
    const result = await place("one-step-fail", id, "place_one_step_fail");
    expect(result.status).toBe(409);
    expect((await request(app).get("/api/cart").set(headers("one-step-fail"))).body.data.itemCount).toBe(2);
    expect((await pool.query("SELECT COUNT(*)::int count FROM customer_orders")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0].stock_quantity).toBe(4);
  });

  it("allows only one one-step order to allocate the final unit", async () => {
    const firstAddress = await address("one-step-first");
    const secondAddress = await address("one-step-second");
    await add("one-step-first", variantA, storeA);
    await add("one-step-second", variantA, storeA);
    await pool.query("UPDATE store_inventory SET stock_quantity=1 WHERE store_id=$1 AND variant_id=$2", [storeA, variantA]);
    const results = await Promise.all([
      place("one-step-first", firstAddress, "place_final_unit_a"),
      place("one-step-second", secondAddress, "place_final_unit_b"),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect((await pool.query("SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2", [storeA, variantA])).rows[0].stock_quantity).toBe(0);
    expect((await pool.query("SELECT COUNT(*)::int count FROM customer_orders")).rows[0].count).toBe(1);
  });

  it("reserves a multi-store cart atomically and returns status", async () => {
    const id = await address("success");
    await add("success", variantA, storeA);
    await add("success", variantB, storeB);
    const result = await reserve("success", id);
    expect(result.status).toBe(201);
    expect(result.body.data.status).toBe("active");
    expect(result.body.data.items).toHaveLength(2);
    expect(
      (
        await request(app)
          .get(`/api/checkout/reservations/${result.body.data.id}`)
          .set(headers("success"))
      ).body.data.status,
    ).toBe("active");
  });
  it("rolls back every store when one line is insufficient", async () => {
    const id = await address("rollback");
    await add("rollback", variantA, storeA);
    await add("rollback", variantB, storeB);
    const before = Number(
      (
        await pool.query(
          `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
          [storeA, variantA],
        )
      ).rows[0].stock_quantity,
    );
    await pool.query(
      `UPDATE store_inventory SET stock_quantity=0 WHERE store_id=$1 AND variant_id=$2`,
      [storeB, variantB],
    );
    const result = await reserve("rollback", id);
    expect(result.status).toBe(409);
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(before);
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) count FROM inventory_reservations"))
          .rows[0].count,
      ),
    ).toBe(0);
  });
  it("is idempotent and rejects conflicting payloads", async () => {
    const id = await address("idem");
    await add("idem");
    const first = await reserve("idem", id, "same_key_123");
    const stock = Number(
      (
        await pool.query(
          `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
          [storeA, variantA],
        )
      ).rows[0].stock_quantity,
    );
    const second = await reserve("idem", id, "same_key_123");
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(stock);
    const other = await address("idem", 17.4483, 78.3915);
    expect((await reserve("idem", other, "same_key_123")).status).toBe(409);
  });
  it("allows only one session to reserve the last unit", async () => {
    await pool.query(
      `UPDATE store_inventory SET stock_quantity=1 WHERE store_id=$1 AND variant_id=$2`,
      [storeA, variantA],
    );
    const firstAddress = await address("race-a"),
      secondAddress = await address("race-b");
    await add("race-a");
    await add("race-b");
    const results = await Promise.all([
      reserve("race-a", firstAddress, "race_key_a"),
      reserve("race-b", secondAddress, "race_key_b"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(0);
  });
  it("releases once and rejects double release", async () => {
    const id = await address("release");
    await add("release");
    const reserved = await reserve("release", id);
    const reservationId = reserved.body.data.id;
    const before = Number(
      (
        await pool.query(
          `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
          [storeA, variantA],
        )
      ).rows[0].stock_quantity,
    );
    expect(
      (
        await request(app)
          .post(`/api/checkout/reservations/${reservationId}/release`)
          .set(headers("release"))
      ).body.data.status,
    ).toBe("released");
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(before + 1);
    expect(
      (
        await request(app)
          .post(`/api/checkout/reservations/${reservationId}/release`)
          .set(headers("release"))
      ).status,
    ).toBe(409);
  });
  it("expires exactly once across concurrent workers", async () => {
    const id = await address("expire");
    await add("expire");
    const reserved = await reserve("expire", id);
    await pool.query(
      `UPDATE inventory_reservations SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1`,
      [reserved.body.data.id],
    );
    const before = Number(
      (
        await pool.query(
          `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
          [storeA, variantA],
        )
      ).rows[0].stock_quantity,
    );
    const counts = await Promise.all([
      expireReservations(),
      expireReservations(),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(
      Number(
        (
          await pool.query(
            `SELECT stock_quantity FROM store_inventory WHERE store_id=$1 AND variant_id=$2`,
            [storeA, variantA],
          )
        ).rows[0].stock_quantity,
      ),
    ).toBe(before + 1);
  });
});
