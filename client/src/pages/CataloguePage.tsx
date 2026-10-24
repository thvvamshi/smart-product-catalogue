import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProductFilters } from "../components/filters/ProductFilters";
import { ProductGrid } from "../components/products/ProductGrid";
import { SearchBar } from "../components/SearchBar";
import { SortSelect } from "../components/SortSelect";
import { useProductSearch } from "../hooks/useProductSearch";
import type { Filters } from "../types/product";

const defaults: Filters = {
  q: "", category: "", brand: "", minPrice: "", maxPrice: "",
  minRating: "", inStock: "", sort: "newest",
};

function fromParams(params: URLSearchParams): Filters {
  return { ...defaults, ...Object.fromEntries([...params].filter(([key]) => key in defaults)) } as Filters;
}

function toApiParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === "sort" && value === defaults.sort)) params.set(key, value);
  }
  params.set("limit", "20");
  return params;
}

export function CataloguePage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => fromParams(params), [params]);
  const apiParams = useMemo(() => toApiParams(filters), [filters]);
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const {
    result, initialLoading, loadingMore, initialError, loadMoreError,
    loadMore, retryInitial, retryLoadMore,
  } = useProductSearch(apiParams);

  useEffect(() => { setQueryDraft(filters.q); }, [filters.q]);
  useEffect(() => {
    if (queryDraft === filters.q) return;
    const timer = window.setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        queryDraft ? next.set("q", queryDraft) : next.delete("q");
        next.delete("cursor");
        next.delete("limit");
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft, filters.q, setParams]);

  const change = useCallback((name: keyof Filters, value: string | number) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      const text = String(value);
      if (text && !(name === "sort" && text === defaults.sort)) next.set(name, text);
      else next.delete(name);
      next.delete("cursor");
      next.delete("limit");
      return next;
    });
  }, [setParams]);

  const clear = useCallback(() => {
    setQueryDraft("");
    setParams(new URLSearchParams());
  }, [setParams]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !result?.pagination.hasNextPage || loadMoreError) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) loadMore(); },
      { rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loadMoreError, result?.pagination.hasNextPage, result?.pagination.nextCursor]);

  const count = result?.data.length ?? 0;

  return (
    <main className="page">
      <section className="hero">
        <p className="kicker">CURATED GOODS, SMART SEARCH</p><h1>Find what fits.</h1>
        <p>Explore a catalogue built for precise search, useful filters, and effortless discovery.</p>
        <SearchBar value={queryDraft} onChange={setQueryDraft} />
      </section>
      <div className="catalogue-layout">
        <ProductFilters filters={filters} onChange={change} onClear={clear} />
        <section className="results" aria-busy={initialLoading || loadingMore}>
          <div className="results-head">
            <div><h2>Products</h2><p aria-live="polite">{result ? `${count} ${count === 1 ? "product" : "products"} loaded` : "Searching catalogue"}</p></div>
            <SortSelect value={filters.sort} onChange={(value) => change("sort", value)} />
          </div>
          {initialLoading && <div className="state" role="status">Loading products…</div>}
          {initialError && !initialLoading && <div className="state error"><h3>We couldn’t load the catalogue</h3><p>{initialError}</p><button type="button" onClick={retryInitial}>Try again</button></div>}
          {!initialError && !initialLoading && result?.data.length === 0 && <div className="state"><h3>No products found</h3><p>Try broadening your search or clearing the filters.</p><button type="button" onClick={clear}>Clear filters</button></div>}
          {!initialError && result && result.data.length > 0 && (
            <>
              <ProductGrid products={result.data} />
              {loadMoreError ? (
                <div className="load-more-status error" role="alert"><span>{loadMoreError}</span><button type="button" onClick={retryLoadMore}>Try loading more</button></div>
              ) : result.pagination.hasNextPage ? (
                <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
              ) : (
                <p className="load-more-status" role="status">You’ve reached the end of the catalogue.</p>
              )}
              {loadingMore && <p className="load-more-status" role="status">Loading more products…</p>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
