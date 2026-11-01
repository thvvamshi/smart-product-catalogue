import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "../pages/OrdersPage";
import { OrderDetailPage } from "../pages/OrderDetailPage";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
describe("order pages", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders customer order history and status", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/orders?limit=20")) return Promise.resolve(ok({ data: [{ id: "1", orderNumber: "ORD-1", status: "partially_rejected", subtotal: "100.00", total: "100.00", currency: "INR", createdAt: new Date().toISOString() }], pagination: { limit: 20, hasNextPage: false, nextCursor: null } }));
      return Promise.reject(new Error("unexpected request"));
    }));
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(await screen.findByText("ORD-1")).toBeInTheDocument();
    expect(screen.getByText(/partially rejected/)).toBeInTheDocument();
  });
  it("renders independent store fulfilment statuses and rejection details", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/orders/1")) return Promise.resolve(ok({ data: { id: "1", orderNumber: "ORD-1", status: "partially_rejected", subtotal: "100.00", total: "100.00", currency: "INR", addressSnapshot: { recipientName: "Test", addressLine1: "Demo", city: "Hyderabad" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storeOrders: [{ id: "10", storeId: "2", storeName: "Store A", status: "accepted", subtotal: "60.00", items: [] }, { id: "11", storeId: "3", storeName: "Store B", status: "rejected", subtotal: "40.00", rejectionReasonCode: "OUT_OF_STOCK", rejectionNote: "Selected size unavailable", items: [] }] } }));
      if (String(input).endsWith("/orders/1/deliveries")) return Promise.resolve(ok({ data: [] }));
      return Promise.resolve(ok({ data: [{ id: "1", fromStatus: null, toStatus: "placed", note: "created", createdAt: new Date().toISOString() }] }));
    }));
    render(<MemoryRouter initialEntries={["/orders/1"]}><Routes><Route path="/orders/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Store A")).toBeInTheDocument();
    expect(screen.getByText(/OUT OF STOCK/)).toBeInTheDocument();
  });
  it("projects a picked-up delivery over its older ready-for-pickup store status", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/orders/1")) return Promise.resolve(ok({ data: { id: "1", orderNumber: "ORD-1", status: "confirmed", subtotal: "100.00", total: "100.00", currency: "INR", addressSnapshot: { recipientName: "Test", addressLine1: "Demo", city: "Hyderabad" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storeOrders: [{ id: "10", storeId: "2", storeName: "Store A", status: "ready_for_pickup", subtotal: "100.00", items: [] }] } }));
      if (url.endsWith("/orders/1/deliveries")) return Promise.resolve(ok({ data: [{ id: "delivery-1", storeOrderId: "10", status: "picked_up", storeName: "Store A" }] }));
      return Promise.resolve(ok({ data: [] }));
    }));
    render(<MemoryRouter initialEntries={["/orders/1"]}><Routes><Route path="/orders/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>);
    expect((await screen.findAllByRole("heading", { name: "Your order is on the way!" })).length).toBeGreaterThan(0);
    const card = screen.getByText("Store A").closest("section.checkout-group");
    expect(card?.querySelector("header strong")).toHaveTextContent("On the way");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Track live delivery" }));
    expect(screen.getByRole("dialog", { name: "Live delivery tracking" })).toBeInTheDocument();
    expect(screen.getByText("Live location is not currently available.")).toBeInTheDocument();
  });
  it("confirms an eligible cancellation through the authoritative customer API", async () => {
    const order = { id: "1", orderNumber: "ORD-1", status: "placed", subtotal: "100.00", total: "100.00", currency: "INR", addressSnapshot: { recipientName: "Test", addressLine1: "Demo", city: "Hyderabad" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storeOrders: [{ id: "10", storeId: "2", storeName: "Store A", status: "pending_acceptance", subtotal: "100.00", items: [] }] };
    const cancelled = { ...order, status: "cancelled", storeOrders: [{ ...order.storeOrders[0], status: "cancelled" }] };
    let wasCancelled = false;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/orders/1/cancel") && init?.method === "POST") { wasCancelled = true; return Promise.resolve(ok({ data: cancelled })); }
      if (url.endsWith("/orders/1")) return Promise.resolve(ok({ data: wasCancelled ? cancelled : order }));
      if (url.endsWith("/orders/1/deliveries")) return Promise.resolve(ok({ data: [] }));
      return Promise.resolve(ok({ data: [] }));
    }));
    render(<MemoryRouter initialEntries={["/orders/1"]}><Routes><Route path="/orders/:orderId" element={<OrderDetailPage />} /></Routes></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(screen.getByRole("dialog", { name: "Cancel this order" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect((await screen.findAllByText("Cancelled")).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("/orders/1/cancel"), expect.objectContaining({ method: "POST" }));
  });
});
