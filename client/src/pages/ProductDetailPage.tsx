import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { ProductGallery } from "../components/discovery/ProductGallery";
import { useLocationSelection } from "../context/LocationContext";
import { addCartItem, fetchDiscoveryDetail, fetchVariantStores, notifyCartChanged } from "../lib/api";
import type {
  DiscoveryDetail,
  DiscoveryVariant,
  VariantStore,
} from "../types/discovery";
export function ProductDetailPage() {
  const { id = "" } = useParams(),
    { location } = useLocationSelection();
  const [data, setData] = useState<DiscoveryDetail["data"] | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [color, setColor] = useState(""),
    [size, setSize] = useState(""),
    [stores, setStores] = useState<VariantStore[]>([]),
    [selectedStoreId, setSelectedStoreId] = useState(""),
    [cartStatus, setCartStatus] = useState(""),
    [storesState, setStoresState] = useState<"idle" | "loading" | "error">(
      "idle",
    );
  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchDiscoveryDetail(
      id,
      location ? new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude) }) : new URLSearchParams(),
      controller.signal,
    )
      .then((response) => {
        setData(response.data);
        const first =
          response.data.variants.find((v) => v.inventory.inStock) ??
          response.data.variants[0];
        setColor(first?.attributes.color ?? "");
        setSize(first?.attributes.size ?? "");
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, location]);
  useEffect(() => load(), [load]);
  const colors = useMemo(
    () => [
      ...new Set(
        data?.variants.map((v) => v.attributes.color).filter(Boolean) ?? [],
      ),
    ],
    [data],
  );
  const allSizes = useMemo(
    () => [
      ...new Set(
        data?.variants.map((v) => v.attributes.size).filter(Boolean) ?? [],
      ),
    ],
    [data],
  );
  const variantsForColor = useMemo(
    () =>
      data?.variants.filter((v) => !color || v.attributes.color === color) ??
      [],
    [data, color],
  );
  useEffect(() => {
    if (!data) return;
    const exact = variantsForColor.find((v) => v.attributes.size === size);
    if (!exact) {
      const next =
        variantsForColor.find((v) => v.inventory.inStock) ??
        variantsForColor[0];
      setSize(next?.attributes.size ?? "");
    }
  }, [data, variantsForColor, size]);
  const selected: DiscoveryVariant | undefined = data?.variants.find(
    (v) =>
      (!color || v.attributes.color === color) &&
      (!size || v.attributes.size === size),
  );
  useEffect(() => {
    if (!location || !selected) {
      setStores([]);
      return;
    }
    const controller = new AbortController();
    setStoresState("loading");
    fetchVariantStores(
      selected.id,
      new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
      }),
      controller.signal,
    )
      .then((response) => {
        setStores(response.data);
        setSelectedStoreId((current) => response.data.some((store) => store.store_id === current) ? current : (response.data[0]?.store_id ?? ""));
        setStoresState("idle");
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setStoresState("error");
      });
    return () => controller.abort();
  }, [location, selected?.id]);
  const selectedStore = stores.find((store) => store.store_id === selectedStoreId) ?? stores[0];
  const etaRange = selectedStore?.eta ? { min: selectedStore.eta.minEtaMinutes, max: selectedStore.eta.maxEtaMinutes } : null;
  if (loading && !data)
    return (
      <main className="product-detail">
        <div className="product-gallery skeleton" />
        <p role="status">Loading product…</p>
      </main>
    );
  if (error)
    return (
      <main className="discovery-page">
        <div className="discovery-message" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      </main>
    );
  if (!data) return null;
  return (
    <main className="product-detail">
      <ProductGallery images={data.product.images} name={data.product.name} />
      <section>
        <p className="eyebrow">{data.product.brand}</p>
        <h1>{data.product.name}</h1>
        <p>{data.product.description}</p>
        {!location ? <p className="discovery-message">Select your delivery location to check local availability.</p> : null}
        {colors.length ? (
          <fieldset>
            <legend>Colour</legend>
            <div className="variant-options">
              {colors.map((value) => {
                const inStock = !location || data.variants.some(
                  (v) => v.attributes.color === value && v.inventory.inStock,
                );
                return (
                  <button
                    aria-pressed={color === value}
                    className={color === value ? "selected" : ""}
                    onClick={() => setColor(value)}
                    key={value}
                  >
                    {value}
                    {!inStock ? <span>Unavailable</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        {allSizes.length ? (
          <fieldset>
            <legend>
              Size{" "}
              {selected?.attributes.sizeSystem
                ? `(${selected.attributes.sizeSystem})`
                : ""}
            </legend>
            <div className="variant-options">
              {allSizes.map((value) => {
                const variant = variantsForColor.find(
                  (v) => v.attributes.size === value,
                );
                const disabled = !variant || (Boolean(location) && !variant.inventory.inStock);
                return (
                  <button
                    aria-pressed={size === value}
                    className={size === value ? "selected" : ""}
                    disabled={disabled}
                    onClick={() => setSize(value)}
                    key={value}
                  >
                    {value}
                    {disabled ? <span>Unavailable</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <p className="variant-sku">
          SKU: {selected?.sku ?? "Select a valid combination"}
        </p>
        {selectedStore ? (
          <div className="availability">
            <strong>₹{selectedStore.price.toFixed(2)}</strong>
            <p>
              {selectedStore.stock_quantity} available at {selectedStore.store_name} ({selectedStore.distance_km} km)
            </p>
            {etaRange ? <small>Estimated delivery: {etaRange.min}–{etaRange.max} min · {selectedStore?.eta?.etaSource === "provisional_haversine" ? "approximate distance estimate" : selectedStore?.eta?.etaSource === "traffic_aware_routing" ? "traffic-aware road estimate" : "road-based estimate"}</small> : null}
          </div>
        ) : !location ? (
          <p className="discovery-message">
            Select your delivery location to check local availability.
          </p>
        ) : (
          <p className="unavailable">
            This exact variant is unavailable near your selected location.
          </p>
        )}
        <button className="primary-action add-cart" disabled={!selected || !selectedStore || selectedStore.stock_quantity < 1} onClick={async()=>{if(!selected || !selectedStore)return;setCartStatus('Adding…');try{await addCartItem(selected.id,selectedStore.store_id,1);notifyCartChanged();setCartStatus('Added to cart — Go to cart')}catch(reason){setCartStatus(reason instanceof Error?reason.message:'Unable to add to cart')}}}>Add selected variant to cart</button>
        {cartStatus?<p role="status">{cartStatus}{cartStatus.startsWith("Added") ? <> · <Link to="/cart">Go to cart</Link></> : null}</p>:null}
        <section className="store-availability" aria-live="polite">
          <h2>Nearby stores for this variant</h2>
          {storesState === "loading" ? (
            <p role="status">Refreshing store availability…</p>
          ) : storesState === "error" ? (
            <p role="alert">Store availability could not be refreshed.</p>
          ) : stores.length ? (
            <ul>
              {stores.map((store) => (
                <li key={store.store_id} className={store.store_id === selectedStoreId ? "selected-store" : ""}>
                  <button type="button" onClick={() => setSelectedStoreId(store.store_id)} aria-pressed={store.store_id === selectedStoreId}>
                  <strong>{store.store_name}</strong>
                  <span>
                    ₹{store.price.toFixed(2)} · {store.stock_quantity} in stock
                    · {store.distance_km} km
                  </span>
                  {store.store_id === stores[0]?.store_id ? <small>Nearest eligible store</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : !location ? (
            <p className="discovery-message">Select your delivery location to see nearby stores for this variant.</p>
          ) : (
            <p>No serviceable store has this exact variant.</p>
          )}
        </section>
        <small>
          Demo inventory; stock must be revalidated before a future checkout.
        </small>
      </section>
    </main>
  );
}
