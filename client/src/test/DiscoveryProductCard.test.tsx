import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryProductCard } from "../components/discovery/DiscoveryProductCard";
import type { DiscoveryItem } from "../types/discovery";

const item: DiscoveryItem = {
  product: { id: "1", name: "Demo Tee", brand: "ThreadLane", category: "T-shirts", description: "", images: [] },
  variant: { id: "v1", sku: "TEE-BLK-M", attributes: { color: "Black", size: "M" } },
  fulfilment: { storeId: "s1", storeName: "Demo Store", distanceKm: 1.2 },
  inventory: { price: 499, availableQuantity: 3, inStock: true },
};

afterEach(() => vi.restoreAllMocks());

describe("DiscoveryProductCard cart action", () => {
  it("adds the exact selected variant and store once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { itemCount: 1 } }), { status: 200 }));
    render(<MemoryRouter><DiscoveryProductCard item={item} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /add demo tee to cart/i }));
    fireEvent.click(screen.getByRole("button", { name: /add demo tee to cart/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added to cart"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/cart/items");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ variantId: "v1", storeId: "s1", quantity: 1 });
  });

  it("does not allow an out-of-stock variant", () => {
    render(<MemoryRouter><DiscoveryProductCard item={{ ...item, inventory: { price: 499, availableQuantity: 0, inStock: false } }} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /demo tee is unavailable/i })).toBeDisabled();
  });
});
