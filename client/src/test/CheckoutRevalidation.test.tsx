import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "../pages/CheckoutPage";
import { LocationProvider } from "../context/LocationContext";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const address = (id: string, label: string) => ({ id, label, recipientName: "Test", phone: "9876543210", addressLine1: "Demo", addressLine2: "", city: "Hyderabad", state: "Telangana", postalCode: "500032", latitude: 17.44, longitude: 78.35, isDefault: id === "1" });
const validation = { valid: true, groups: [], subtotal: "0.00", deliveryFee: null, total: "0.00", currency: "INR", issues: [], eta: null };

describe("checkout ETA revalidation", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("debounces cart-change validation and invalidates prior results", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/addresses")) return Promise.resolve(ok({ data: [address("1", "Home"), address("2", "Office")] }));
      if (url.endsWith("/checkout/validate")) return Promise.resolve(ok({ data: validation }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><LocationProvider><CheckoutPage /></LocationProvider></MemoryRouter>);
    expect(await screen.findByRole("option", { name: /Home/ })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/checkout/validate"))).toHaveLength(1));
    expect(screen.getByText("Ready to place your order")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Delivery address"), "2");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/checkout/validate"))).toHaveLength(2));
    act(() => window.dispatchEvent(new Event("cart:changed")));
    expect(screen.queryByText("Ready to place your order")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/checkout/validate"))).toHaveLength(3));
  });
});
