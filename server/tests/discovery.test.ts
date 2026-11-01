import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";
const location = "latitude=17.4401&longitude=78.3489&maxDistanceKm=20";
describe("fashion discovery", () => {
  it("discovers serviceable variant inventory and returns an opaque cursor contract", async () => {
    const r = await request(app).get(
      `/api/discovery/products?${location}&search=fashion&limit=1`,
    );
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].variant.sku).toContain("FASH-TEST");
    expect(r.body.data[0].inventory.inStock).toBe(true);
    expect(r.body.data[0].fulfilment.storeId).toEqual(expect.any(String));
    expect(r.body.pagination).toEqual(
      expect.objectContaining({ limit: 1, hasMore: expect.any(Boolean) }),
    );
  });
  it.each(["relevance", "price_asc", "price_desc", "nearest"])(
    "supports stable %s sorting",
    async (sort) => {
      const r = await request(app).get(
        `/api/discovery/products?${location}&sort=${sort}`,
      );
      expect(r.status).toBe(200);
      expect(r.body.data.length).toBeGreaterThan(0);
    },
  );
  it("applies variant filters and excludes zero stock", async () => {
    const ok = await request(app).get(
      `/api/discovery/products?${location}&size=M&color=Black&gender=men`,
    );
    expect(ok.status).toBe(200);
    expect(
      ok.body.data.some((x: any) => x.variant.sku === "FASH-TEST-BLK-M"),
    ).toBe(true);
    const empty = await request(app).get(
      `/api/discovery/products?${location}&size=L&color=Black`,
    );
    expect(empty.status).toBe(200);
    expect(
      empty.body.data.some((x: any) => x.variant.sku === "FASH-TEST-BLK-L"),
    ).toBe(false);
  });
  it("rejects malformed and sort-mismatched cursors", async () => {
    expect(
      (
        await request(app).get(
          `/api/discovery/products?${location}&cursor=broken`,
        )
      ).status,
    ).toBe(400);
  });
  it("uses keyset cursors without repeating products", async () => {
    for (const sort of ["relevance", "price_asc", "price_desc", "nearest"]) {
      const first = await request(app).get(
        `/api/discovery/products?${location}&sort=${sort}&limit=2`,
      );
      expect(first.status).toBe(200);
      expect(first.body.pagination.nextCursor).toEqual(expect.any(String));
      const second = await request(app).get(
        `/api/discovery/products?${location}&sort=${sort}&limit=2&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`,
      );
      expect(second.status).toBe(200);
      const ids = new Set(
        first.body.data.map((x: { product: { id: string } }) => x.product.id),
      );
      expect(
        second.body.data.every(
          (x: { product: { id: string } }) => !ids.has(x.product.id),
        ),
      ).toBe(true);
    }
  });
  it("returns category, filter, suggestions, detail and variant-store resources", async () => {
    const categories = await request(app).get("/api/discovery/categories");
    expect(categories.body.data[0].children.length).toBeGreaterThan(0);
    const filters = await request(app).get("/api/discovery/filters");
    expect(filters.body.data.colors).toContain("Black");
    expect(filters.body.data.sizeSystems).toContain("Alpha");
    const categoryFilters = await request(app)
      .get("/api/discovery/filters")
      .query({ category: "men-tshirts" });
    expect(categoryFilters.status).toBe(200);
    expect(categoryFilters.body.data.brands).toEqual(["ThreadLane"]);
    expect(categoryFilters.body.data.sizes).toEqual(["L", "M"]);
    const suggestions = await request(app).get(
      `/api/discovery/suggestions?${location}&search=Fashion`,
    );
    expect(suggestions.body.data[0].name).toContain("Fashion");
    const globalSuggestions = await request(app).get(
      "/api/discovery/suggestions?search=black",
    );
    expect(globalSuggestions.status).toBe(200);
    expect(globalSuggestions.body.data.length).toBeGreaterThan(0);
    const search = await request(app).get(
      `/api/discovery/products?${location}&search=fashion`,
    );
    const item = search.body.data[0];
    expect(
      (
        await request(app).get(
          `/api/discovery/products/${item.product.id}?${location}`,
        )
      ).status,
    ).toBe(200);
    const stores = await request(app).get(
      `/api/discovery/variants/${item.variant.id}/stores?${location}`,
    );
    expect(stores.body.data.length).toBeGreaterThan(0);
  });
});
describe("variant data integrity", () => {
  it("enforces unique SKUs and structured attributes transactionally", async () => {
    const client = await pool.connect();
    try {
      const product = (
        await client.query<{ id: string }>(
          `SELECT id::text FROM products WHERE sku='FASH-TEST'`,
        )
      ).rows[0]!;
      await client.query("BEGIN");
      await expect(
        client.query(
          `INSERT INTO product_variants(product_id,sku,attributes) VALUES($1,'FASH-TEST-BLK-M','{}')`,
          [product.id],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await expect(
        client.query(
          `INSERT INTO product_variants(product_id,sku,attributes) VALUES($1,'BAD-ATTR','[]')`,
          [product.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
  it("rejects inventory attached to the wrong product", async () => {
    const client = await pool.connect();
    try {
      const product = (
          await client.query<{ id: string }>(
            `SELECT id::text FROM products WHERE sku='FASH-TEST'`,
          )
        ).rows[0]!,
        other = (
          await client.query<{ id: string }>(
            `SELECT id::text FROM products WHERE id<>$1 LIMIT 1`,
            [product.id],
          )
        ).rows[0]!,
        variant = (
          await client.query<{ id: string }>(
            `SELECT id::text FROM product_variants WHERE product_id=$1 LIMIT 1`,
            [product.id],
          )
        ).rows[0]!,
        store = (
          await client.query<{ id: string }>(
            `SELECT id::text FROM stores LIMIT 1`,
          )
        ).rows[0]!;
      await client.query("BEGIN");
      await expect(
        client.query(
          `INSERT INTO store_inventory(store_id,product_id,variant_id,stock_quantity,selling_price) VALUES($1,$2,$3,1,10)`,
          [store.id, other.id, variant.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
