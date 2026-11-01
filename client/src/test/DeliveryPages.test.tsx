import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryDashboardPage } from "../pages/DeliveryDashboardPage";
import { AgentDeliveryDetailPage } from "../pages/AgentDeliveryDetailPage";
import { StoreDashboardPage } from "../pages/StoreDashboardPage";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
describe("delivery pages", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads dispatch tasks, status workspaces, and agents", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => { const url=String(input); if(url.includes("/dispatch/tasks")) return Promise.resolve(ok({ data: [{ id: "1", taskNumber: "DLV-1", status: "pending_assignment" }, { id: "3", taskNumber: "DLV-3", status: "assigned", agentName: "Current agent" }], pagination: {} })); if(url.includes("/dispatch/settings")){ const body=init?.body?JSON.parse(String(init.body)):{}; return Promise.resolve(ok({ data: { simulationEnabled: true, speedKmh: body.speedKmh ?? 20, tickIntervalMs: 5000, preparationDurationSeconds: 30 }, demoOnly:true })); } return Promise.resolve(ok({ data: [{ id: "2", agentCode: "AGENT-1", name: "Demo Agent", status: "active", availability: "available" }] })); }));
    render(<DeliveryDashboardPage />);
    await userEvent.type(screen.getByPlaceholderText("dispatch_admin_1"), "dispatch_admin_1");
    await userEvent.click(screen.getByRole("button", { name: "Load dispatch" }));
    expect(await screen.findByText("DLV-1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Ready for assignment/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Assigned/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Reassign DLV-3")).toBeInTheDocument();
    expect(screen.getByText(/Simulation:/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Simulation speed (km/h)"));
    await userEvent.type(screen.getByLabelText("Simulation speed (km/h)"), "40");
    await userEvent.click(screen.getByRole("button", { name: "Save demo speed" }));
    expect(await screen.findByRole("status")).toHaveTextContent("40 km/h");
  });
  it("shows agent workflow state and transition control", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok({ data: { id: "1", taskNumber: "DLV-1", status: "assigned" } }))));
    render(<MemoryRouter initialEntries={["/agent/deliveries/1"]}><Routes><Route path="/agent/deliveries/:id" element={<AgentDeliveryDetailPage />} /></Routes></MemoryRouter>);
    await userEvent.type(screen.getByPlaceholderText("agent_identity_1"), "agent_identity_1");
    expect(await screen.findByRole("button", { name: "Heading to store" })).toBeInTheDocument();
  });
  it("starts and stops browser location sharing only after explicit activation", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).includes("/location") ? Promise.resolve(ok({ data: { accepted: true } })) : Promise.resolve(ok({ data: { id: "1", taskNumber: "DLV-1", status: "assigned" } }))));
    const clearWatch = vi.fn();
    const watchPosition = vi.fn(() => 7);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition, clearWatch } });
    render(<MemoryRouter initialEntries={["/agent/deliveries/1"]}><Routes><Route path="/agent/deliveries/:id" element={<AgentDeliveryDetailPage />} /></Routes></MemoryRouter>);
    await userEvent.type(screen.getByPlaceholderText("agent_identity_1"), "agent_identity_1");
    await screen.findByRole("button", { name: "Start location sharing" });
    expect(watchPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start location sharing" }));
    expect(watchPosition).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Stop location sharing" }));
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
  it("makes pending store acceptance discoverable with an authorized demo operator", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/store-orders")) return Promise.resolve(ok({ data: [{ id: "1", storeOrderNumber: "STO-1", status: "pending_acceptance", subtotal: "100.00" }], store: { id: "store-1", storeCode: "HYD-GAC-001", storeName: "Demo Store" } }));
      return Promise.resolve(ok({ data: { id: "1", storeOrderNumber: "STO-1", storeName: "Demo Store", status: "pending_acceptance", subtotal: "100.00", items: [{ id: "item-1", productName: "Demo Tee", sku: "TEE-M", quantity: 1 }] } }));
    }));
    render(<StoreDashboardPage />);
    expect(screen.getByText(/demo-operator-<STORE_CODE>/)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("demo-operator-HYD-GAC-001"), "demo-operator-HYD-GAC-001");
    await userEvent.click(screen.getByRole("button", { name: "Load orders" }));
    expect(await screen.findByText("STO-1")).toBeInTheDocument();
    expect(screen.getByText(/Authorized store:/)).toHaveTextContent("HYD-GAC-001");
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
