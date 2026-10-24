import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CataloguePage } from "../pages/CataloguePage";
import type { Product, ProductResponse } from "../types/product";

const makeProduct = (id: number, name = `Product ${id}`): Product => ({
  id: String(id), sku: `TEST-${id}`, name, description: "Clear sound", brand: "Aster",
  category: "Electronics", price: 100 + id, rating: 4.7, inStock: true,
  createdAt: "2024-01-01T00:00:00.000Z", imageUrl: null,
});
const response = (data: Product[], nextCursor: string | null = null): ProductResponse => ({
  data, pagination: { limit: 20, nextCursor, hasNextPage: nextCursor !== null },
});
const ok = (body: ProductResponse) => ({ ok: true, json: async () => body }) as Response;
const batch = (start: number, length = 20) => Array.from({ length }, (_, index) => makeProduct(start + index));

let observerCallback: IntersectionObserverCallback;
let observerOptions: IntersectionObserverInit | undefined;
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[] = [0];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    observerCallback = callback;
    observerOptions = options;
    this.rootMargin = typeof options?.rootMargin === "string" ? options.rootMargin : "0px";
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function renderPage(initial = "/") {
  return render(<MemoryRouter initialEntries={[initial]}><Routes><Route path="/" element={<><CataloguePage /><Location /></>} /></Routes></MemoryRouter>);
}
function intersect() {
  act(() => observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
}

describe("CataloguePage infinite scrolling", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(response(batch(1)))));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("loads the initial 20 products without a cursor", async () => {
    renderPage("/?limit=2&cursor=OLD_CURSOR");
    expect(screen.getByText("Loading products…")).toBeInTheDocument();
    expect(await screen.findByText("Product 20")).toBeInTheDocument();
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain("limit=20");
    expect(url).not.toContain("cursor=");
    expect(screen.getByText("20 products loaded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next|previous/i })).not.toBeInTheDocument();
  });

  it("loads automatically near the sentinel and appends the next batch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "CURSOR_20"))).mockResolvedValueOnce(ok(response(batch(21))));
    renderPage();
    await screen.findByText("Product 20");
    expect(observerOptions?.rootMargin).toBe("320px 0px");
    intersect();
    expect(await screen.findByText("Product 40")).toBeInTheDocument();
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    expect(screen.getByText("40 products loaded")).toBeInTheDocument();
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain("cursor=CURSOR_20");
  });

  it("prevents concurrent requests for the same cursor", async () => {
    let resolveMore: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "CURSOR_20")))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveMore = resolve; }));
    renderPage();
    await screen.findByText("Product 20");
    intersect();
    intersect();
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { resolveMore?.(ok(response(batch(21)))); await Promise.resolve(); });
  });

  it("shows empty and populated end states separately", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(response([])));
    const view = renderPage();
    expect(await screen.findByText("No products found")).toBeInTheDocument();
    expect(screen.queryByText(/reached the end/i)).not.toBeInTheDocument();
    view.unmount();
    vi.mocked(fetch).mockResolvedValueOnce(ok(response([makeProduct(1)])));
    renderPage();
    expect(await screen.findByText("You’ve reached the end of the catalogue.")).toBeInTheDocument();
  });

  it("shows a load-more error and retries the same cursor", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "CURSOR_20")))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { message: "Load more failed" } }) } as Response)
      .mockResolvedValueOnce(ok(response(batch(21))));
    renderPage();
    await screen.findByText("Product 20");
    intersect();
    expect(await screen.findByText("Load more failed")).toBeInTheDocument();
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try loading more" }));
    expect(await screen.findByText("Product 40")).toBeInTheDocument();
  });

  it.each([["Brand", "Aster", "brand=Aster"], ["Sort by", "price_asc", "sort=price_asc"]])(
    "resets accumulated products and the cursor when %s changes", async (label, value, query) => {
      vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "CURSOR_20")))
        .mockResolvedValueOnce(ok(response([makeProduct(101, "Reset Result")])));
      renderPage();
      await screen.findByText("Product 20");
      await userEvent.selectOptions(screen.getByLabelText(label), value);
      expect(await screen.findByText("Reset Result")).toBeInTheDocument();
      expect(screen.queryByText("Product 1")).not.toBeInTheDocument();
      expect(screen.getByTestId("location").textContent).toContain(query);
      const url = String(vi.mocked(fetch).mock.calls[1]?.[0]);
      expect(url).not.toContain("cursor=");
      expect(url).toContain("limit=20");
    },
  );

  it("does not append a stale load-more response after filters change", async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "CURSOR_20")))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(ok(response([makeProduct(101, "Filtered Result")])));
    renderPage();
    await screen.findByText("Product 20");
    intersect();
    await userEvent.selectOptions(screen.getByLabelText("Brand"), "Aster");
    expect(await screen.findByText("Filtered Result")).toBeInTheDocument();
    await act(async () => { resolveOld?.(ok(response([makeProduct(21, "Stale Append")]))); await Promise.resolve(); });
    expect(screen.queryByText("Stale Append")).not.toBeInTheDocument();
  });

  it("deduplicates stable product IDs across batches", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(response([makeProduct(1), makeProduct(2)], "NEXT")))
      .mockResolvedValueOnce(ok(response([makeProduct(2), makeProduct(3), makeProduct(3)])));
    renderPage();
    await screen.findByText("Product 2");
    intersect();
    await screen.findByText("Product 3");
    expect(screen.getAllByText("Product 2")).toHaveLength(1);
    expect(screen.getAllByText("Product 3")).toHaveLength(1);
    expect(screen.getByText("3 products loaded")).toBeInTheDocument();
  });

  it("debounces keyword changes and starts a fresh initial request", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(ok(response(batch(1), "NEXT")))
      .mockResolvedValueOnce(ok(response([makeProduct(200, "Camera Result")])));
    renderPage();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "camera" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain("q=camera");
  });

  it("recovers from an initial request failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { message: "Service unavailable" } }) } as Response)
      .mockResolvedValueOnce(ok(response([makeProduct(1)])));
    renderPage();
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading products…")).not.toBeInTheDocument());
  });
});
