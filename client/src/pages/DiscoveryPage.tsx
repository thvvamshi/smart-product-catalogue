import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ActiveFilterChips } from "../components/discovery/ActiveFilterChips";
import { CategoryNavigation } from "../components/discovery/CategoryNavigation";
import {
  DiscoveryFilters,
  type FilterState,
} from "../components/discovery/DiscoveryFilters";
import { DiscoveryProductCard } from "../components/discovery/DiscoveryProductCard";
import { DiscoverySearch } from "../components/discovery/DiscoverySearch";
import { useLocationSelection } from "../context/LocationContext";
import { useProductDiscovery } from "../hooks/useProductDiscovery";
import { fetchDiscoveryCategories, fetchDiscoveryFilters } from "../lib/api";
import type {
  DiscoveryCategory,
  DiscoveryFilters as FilterOptions,
} from "../types/discovery";
const emptyFilters: FilterState = {
  brand: "",
  gender: "",
  size: "",
  sizeSystem: "",
  color: "",
  material: "",
  minPrice: "",
  maxPrice: "",
  availability: false,
};
const emptyOptions: FilterOptions = {
  brands: [],
  genders: [],
  sizes: [],
  sizeSystems: [],
  colors: [],
  materials: [],
};
export function DiscoveryPage() {
  const { location, serviceability, loading: locationLoading } = useLocationSelection();
  const [url, setUrl] = useSearchParams();
  const category = url.get("category") ?? "";
  const sort = url.get("sort") ?? "relevance";
  const [search, setSearch] = useState(url.get("search") ?? "");
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...emptyFilters,
    brand: url.get("brand") ?? "",
    gender: url.get("gender") ?? "",
    size: url.get("size") ?? "",
    sizeSystem: url.get("sizeSystem") ?? "",
    color: url.get("color") ?? "",
    material: url.get("material") ?? "",
    minPrice: url.get("minPrice") ?? "",
    maxPrice: url.get("maxPrice") ?? "",
    availability: url.get("availability") === "true",
  }));
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]),
    [options, setOptions] = useState<FilterOptions>(emptyOptions),
    [metaState, setMetaState] = useState<"loading" | "ready" | "error">(
      "loading",
    ), [metaAttempt, setMetaAttempt] = useState(0);
  const updateUrl = useCallback(
    (changes: Record<string, string>) =>
      setUrl(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes))
            value ? next.set(key, value) : next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setUrl],
  );
  useEffect(() => {
    const timer = setTimeout(() => updateUrl({ search }), 300);
    return () => clearTimeout(timer);
  }, [search, updateUrl]);
  useEffect(() => {
    const controller = new AbortController();
    setMetaState("loading");
    Promise.all([
      fetchDiscoveryCategories(controller.signal),
      fetchDiscoveryFilters(category || undefined, controller.signal),
    ])
      .then(([categoryResult, filterResult]) => {
        setCategories(categoryResult.data);
        setOptions(filterResult.data);
        setFilters((current) => ({
          ...current,
          brand: filterResult.data.brands.includes(current.brand)
            ? current.brand
            : "",
          gender: filterResult.data.genders.includes(current.gender)
            ? current.gender
            : "",
          size: filterResult.data.sizes.includes(current.size)
            ? current.size
            : "",
          sizeSystem: filterResult.data.sizeSystems.includes(current.sizeSystem)
            ? current.sizeSystem
            : "",
          color: filterResult.data.colors.includes(current.color)
            ? current.color
            : "",
          material: filterResult.data.materials.includes(current.material)
            ? current.material
            : "",
        }));
        setMetaState("ready");
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setMetaState("error");
      });
    return () => controller.abort();
  }, [category, metaAttempt]);
  useEffect(() => {
    updateUrl({
      brand: filters.brand,
      gender: filters.gender,
      size: filters.size,
      sizeSystem: filters.sizeSystem,
      color: filters.color,
      material: filters.material,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      availability: filters.availability ? "true" : "",
    });
  }, [filters, updateUrl]);
  const params = useMemo(
    () =>
      new URLSearchParams({
            ...(location ? { latitude: String(location.latitude), longitude: String(location.longitude), maxDistanceKm: "10" } : {}),
            search: url.get("search") ?? "",
            ...(category && { category }),
            ...(filters.brand && { brand: filters.brand }),
            ...(filters.gender && { gender: filters.gender }),
            ...(filters.size && { size: filters.size }),
            ...(filters.sizeSystem && { sizeSystem: filters.sizeSystem }),
            ...(filters.color && { color: filters.color }),
            ...(filters.material && { material: filters.material }),
            ...(filters.minPrice && { minPrice: filters.minPrice }),
            ...(filters.maxPrice && { maxPrice: filters.maxPrice }),
            ...(filters.availability && { availability: "true" }),
            sort,
          }),
    [location, url, category, filters, sort],
  );
  const result = useProductDiscovery(params);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && result.hasMore && !result.loading)
          result.loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [result.hasMore, result.loading, result.loadMore]);
  const clear = () => {
    setSearch("");
    setFilters(emptyFilters);
    setUrl(new URLSearchParams(), { replace: true });
  };
  const remove = (key: keyof FilterState | "category") =>
    key === "category"
      ? updateUrl({ category: "" })
      : setFilters((current) => ({
          ...current,
          [key]: key === "availability" ? false : "",
        }));
  return (
    <main className="discovery-page">
      <header className="fashion-hero">
        <p className="eyebrow">Fashion, fulfilled nearby</p>
        <h1>Discover your next look.</h1>
        <p>
          Variant-accurate demo inventory from serviceable Hyderabad stores.
        </p>
      </header>
      {!location ? <p className="location-prompt" role="status">Select your delivery location to see products available near you.</p> : null}
      {location && !locationLoading && serviceability && !serviceability.isServiceable ? <section className="discovery-message coming-soon"><h2>We're not serving your area yet</h2><p>Delivery to this location is coming soon. We're working on bringing nearby fashion stores to your area.</p></section> : null}
        <>
          {metaState === "loading" ? (
            <div className="category-skeleton" role="status">
              Loading fashion categories…
            </div>
          ) : metaState === "error" ? (
            <div className="discovery-message" role="alert">
              Unable to load categories and filters.{" "}
              <button onClick={() => setMetaAttempt((value) => value + 1)}>Retry</button>
            </div>
          ) : categories.length ? (
            <CategoryNavigation
              categories={categories}
              selected={category}
              onSelect={(value) => updateUrl({ category: value })}
            />
          ) : (
            <div className="discovery-message">
              No fashion categories are available.
            </div>
          )}
          <DiscoverySearch
            value={search}
            onChange={setSearch}
            onSubmit={() => updateUrl({ search })}
            location={location}
          />
          {metaState === "ready" ? (
            <DiscoveryFilters
              value={filters}
              options={options}
              onChange={setFilters}
              onClear={clear}
            />
          ) : null}
          <label className="sort-control">
            Sort results
            <select
              aria-label="Sort results"
              value={sort}
              onChange={(e) => updateUrl({ sort: e.target.value })}
            >
              <option value="relevance">Relevance</option>
              <option value="nearest">Nearest store</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <ActiveFilterChips
            filters={filters}
            category={category}
            onRemove={remove}
          />
          {result.loading && !result.items.length ? (
            <div className="fashion-grid" aria-label="Loading products">
              {[1, 2, 3, 4].map((value) => (
                <div className="fashion-card skeleton" key={value} />
              ))}
            </div>
          ) : null}
          {result.error && !result.items.length ? (
            <div className="discovery-message" role="alert">
              {result.error}
              <button onClick={result.retry}>Retry</button>
            </div>
          ) : null}
          <section className="fashion-grid" aria-live="polite">
            {result.items.map((item) => (
              <DiscoveryProductCard key={item.product.id} item={item} />
            ))}
          </section>
          {result.error && result.items.length ? (
            <div role="alert">
              Could not load more. <button onClick={result.retry}>Retry</button>
            </div>
          ) : null}
          <div
            ref={sentinel}
            className="discovery-sentinel"
            aria-hidden="true"
          />
          {result.loading && result.items.length ? (
            <p role="status">Loading more fashion…</p>
          ) : !result.hasMore && result.items.length ? (
            <p className="end-message">
              You’ve reached the end of these looks.
            </p>
          ) : null}
          {!result.loading && !result.items.length && !result.error ? (
            <div className="discovery-message">
              No serviceable fashion matches these filters.{" "}
              <button onClick={clear}>Clear filters</button>
            </div>
          ) : null}
        </>
    </main>
  );
}
