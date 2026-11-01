import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveOrderBanner } from "../components/orders/ActiveOrderBanner";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

describe("ActiveOrderBanner", () => {
  it("shows active session orders and excludes terminal orders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ data: [
      { id: "1", orderNumber: "ORD-12345678", status: "placed", total: "999.00", createdAt: new Date().toISOString() },
      { id: "2", orderNumber: "ORD-00000000", status: "completed", total: "999.00", createdAt: new Date().toISOString() },
    ], pagination: { nextCursor: null, hasNextPage: false } })));
    render(<MemoryRouter><ActiveOrderBanner /></MemoryRouter>);
    expect(await screen.findByText("Order 12345678")).toBeInTheDocument();
    expect(screen.getByText("Your order is waiting for store confirmation.")).toBeInTheDocument();
    expect(screen.queryByText("Order 00000000")).not.toBeInTheDocument();
  });
  it("refreshes immediately after a successful local order-created signal", async () => {
    let created = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(ok({ data: created ? [{ id: "3", orderNumber: "ORD-33333333", status: "placed", total: "999.00", createdAt: new Date().toISOString() }] : [], pagination: { nextCursor: null, hasNextPage: false } }))));
    render(<MemoryRouter><ActiveOrderBanner /></MemoryRouter>);
    expect(screen.queryByText("Order 33333333")).not.toBeInTheDocument();
    created = true;
    window.dispatchEvent(new CustomEvent("order:created", { detail: { orderId: "3" } }));
    expect(await screen.findByText("Order 33333333")).toBeInTheDocument();
  });
});
