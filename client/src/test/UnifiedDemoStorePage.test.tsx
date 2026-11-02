import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnifiedDemoStorePage } from "../pages/UnifiedDemoStorePage";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("UnifiedDemoStorePage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows only the next valid lifecycle action for an accepted store order", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok({
      data: [{
        id: "1", storeOrderNumber: "STORE-1", storeName: "Demo Store", orderNumber: "ORD-1",
        status: "accepted", subtotal: "100.00", items: [],
      }],
    }))));

    render(<MemoryRouter><UnifiedDemoStorePage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "Start preparation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm agent pickup" })).not.toBeInTheDocument();
  });
});
