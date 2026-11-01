import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoveryPage } from "../pages/DiscoveryPage";
import { ProductDetailPage } from "../pages/ProductDetailPage";
vi.mock("../context/LocationContext", () => {
  const location = {
    label: "Gachibowli",
    area: "Gachibowli",
    city: "Hyderabad",
    postalCode: "500032",
    latitude: 17.4401,
    longitude: 78.3489,
    timestamp: 1,
  };
  return {
    useLocationSelection: () => ({
      location,
      serviceability: null,
      nearbyStores: [],
      loading: false,
      error: null,
    }),
  };
});
const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const product = {
  product: {
    id: "20",
    name: "Fashion Tee",
    brand: "ThreadLane",
    category: "T-shirts",
    description: "Demo fashion",
    images: [],
  },
  variant: {
    id: "201",
    sku: "TEE-BLK-M",
    attributes: {
      gender: "men",
      size: "M",
      sizeSystem: "Alpha",
      color: "Black",
      material: "Cotton",
    },
  },
  fulfilment: { storeId: "1", storeName: "Demo Gachibowli", distanceKm: 1.2 },
  inventory: { price: 999, availableQuantity: 4, inStock: true },
};
const categories = {
  data: [
    {
      id: "1",
      slug: "men",
      name: "Men",
      children: [{ id: "2", slug: "men-tshirts", name: "T-shirts" }],
    },
    {
      id: "3",
      slug: "accessories",
      name: "Accessories",
      children: [{ id: "4", slug: "bags", name: "Bags" }],
    },
  ],
};
const filters = {
  data: {
    brands: ["ThreadLane"],
    genders: ["men"],
    sizes: ["M", "L"],
    sizeSystems: ["Alpha"],
    colors: ["Black", "Ivory"],
    materials: ["Cotton"],
  },
};
function installDiscoveryFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/categories")) return Promise.resolve(ok(categories));
      if (url.includes("/filters"))
        return Promise.resolve(
          ok(
            url.includes("category=bags")
              ? { data: { ...filters.data, sizes: [], sizeSystems: [] } }
              : filters,
          ),
        );
      if (url.includes("/suggestions"))
        return Promise.resolve(
          ok({
            data: [{ id: "20", name: "Fashion Tee", brand: "ThreadLane" }],
          }),
        );
      if (url.includes("/products"))
        return Promise.resolve(
          ok({
            data: [product],
            pagination: { limit: 20, nextCursor: null, hasMore: false },
          }),
        );
      throw new Error(url);
    }),
  );
}
describe("completed discovery experience", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("browses API categories, combines filters, exposes chips, and clears them", async () => {
    installDiscoveryFetch();
    render(
      <MemoryRouter initialEntries={["/discover"]}>
        <DiscoveryPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Men" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "T-shirts" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) =>
            String(url).includes("category=men-tshirts"),
          ),
      ).toBe(true),
    );
    await userEvent.selectOptions(screen.getByLabelText("Brand"), "ThreadLane");
    await userEvent.selectOptions(screen.getByLabelText("Colour"), "Black");
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => {
          const value = String(url);
          return (
            value.includes("/products?") &&
            value.includes("brand=ThreadLane") &&
            value.includes("color=Black")
          );
        }),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: /brand: ThreadLane/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /brand:/i }),
      ).not.toBeInTheDocument(),
    );
  });
  it("hides size controls when the selected category has no sizes", async () => {
    installDiscoveryFetch();
    render(
      <MemoryRouter>
        <DiscoveryPage />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Bags" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Size")).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Size system")).not.toBeInTheDocument();
  });
  it("debounces autocomplete and selects product suggestions", async () => {
    installDiscoveryFetch();
    render(
      <MemoryRouter>
        <DiscoveryPage />
      </MemoryRouter>,
    );
    const input = screen.getByRole("combobox", { name: "Search fashion" });
    await userEvent.type(input, "Fa");
    expect(
      await screen.findByRole("option", { name: /Fashion Tee/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Fashion Tee/ }));
    expect(input).toHaveValue("Fashion Tee");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("ignores a stale autocomplete response", async () => {
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    let suggestionCalls = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/categories")) return Promise.resolve(ok(categories));
      if (url.includes("/filters")) return Promise.resolve(ok(filters));
      if (url.includes("/products")) return Promise.resolve(ok({ data: [product], pagination: { limit: 20, nextCursor: null, hasMore: false } }));
      if (url.includes("/suggestions")) {
        suggestionCalls += 1;
        return new Promise<Response>((resolve) => { if (suggestionCalls === 1) resolveFirst = resolve; else resolveSecond = resolve; });
      }
      throw new Error(url);
    }));
    render(<MemoryRouter><DiscoveryPage /></MemoryRouter>);
    const input = screen.getByRole("combobox", { name: "Search fashion" });
    await userEvent.type(input, "Fa");
    await waitFor(() => expect(suggestionCalls).toBe(1));
    await userEvent.clear(input); await userEvent.type(input, "Sh");
    await waitFor(() => expect(suggestionCalls).toBe(2));
    resolveSecond(ok({ data: [{ id: "2", name: "Shoes", brand: "Stride" }] }));
    expect(await screen.findByRole("option", { name: /Shoes/ })).toBeInTheDocument();
    resolveFirst(ok({ data: [{ id: "1", name: "Fashion Tee", brand: "ThreadLane" }] }));
    await waitFor(() => expect(screen.queryByRole("option", { name: /Fashion Tee/ })).not.toBeInTheDocument());
  });
});

describe("product detail variants", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("navigates the gallery, clears invalid combinations, and refreshes exact-variant stores", async () => {
    const detail = {
      data: {
        product: { ...product.product, images: ["/one.jpg", "/two.jpg"] },
        variants: [
          {
            ...product.variant,
            fulfilment: product.fulfilment,
            inventory: product.inventory,
          },
          {
            id: "202",
            sku: "TEE-BLK-L",
            attributes: { ...product.variant.attributes, size: "L" },
            fulfilment: null,
            inventory: { price: null, availableQuantity: 0, inStock: false },
          },
          {
            id: "203",
            sku: "TEE-IVR-L",
            attributes: {
              ...product.variant.attributes,
              color: "Ivory",
              size: "L",
            },
            fulfilment: { ...product.fulfilment, storeName: "Demo Madhapur" },
            inventory: { price: 1099, availableQuantity: 2, inStock: true },
          },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/variants/"))
          return Promise.resolve(
            ok({
              data: [
                {
                  store_id: "2",
                  store_name: url.includes("203")
                    ? "Demo Madhapur"
                    : "Demo Gachibowli",
                  distance_km: 1.5,
                  price: url.includes("203") ? 1099 : 999,
                  stock_quantity: 2,
                },
              ],
            }),
          );
        return Promise.resolve(ok(detail));
      }),
    );
    render(
      <MemoryRouter initialEntries={["/fashion/20"]}>
        <Routes>
          <Route path="/fashion/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByAltText(/image 1 of 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByAltText(/image 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /L Unavailable/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Ivory/ }));
    await waitFor(() =>
      expect(screen.getByText("SKU: TEE-IVR-L")).toBeInTheDocument(),
    );
    expect((await screen.findAllByText(/Demo Madhapur/)).length).toBeGreaterThanOrEqual(2);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/variants/203/stores"),
        ),
    ).toBe(true);
  });
});
