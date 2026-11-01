import { useState, useContext } from "react";
import type { Product } from "../../types/product";
import { LocationContext } from "../../context/location-context";
import { useNavigate } from "react-router-dom";
import { addCartItem, fetchDiscoveryDetail, notifyCartChanged } from "../../lib/api";

export function ProductCard({ product }: { product: Product }) {
  const context = useContext(LocationContext);
  const location = context?.location ?? null;
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [message, setMessage] = useState("");
  const add = async () => {
    if (!location || status === "loading" || !product.inStock) return;
    setStatus("loading");
    setMessage("");
    try {
      const detail = await fetchDiscoveryDetail(product.id, new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), maxDistanceKm: "10" }));
      const eligible = detail.data.variants.filter((variant) => variant.fulfilment && variant.inventory.inStock);
      if (eligible.length > 1) {
        navigate(`/fashion/${product.id}`);
        return;
      }
      const selected = eligible[0];
      if (!selected?.fulfilment) throw new Error("No available variant near your location");
      await addCartItem(selected.id, selected.fulfilment.storeId, 1);
      notifyCartChanged();
      setStatus("added");
      setMessage("Added to cart");
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : "Unable to add to cart");
    }
  };
  return (
    <article className="product-card">
      <div className="image-wrap">
        <img
          src={product.imageUrl || "https://placehold.co/600x400?text=Product"}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="card-body">
        <div className="eyebrow">
          {product.category} · {product.brand}
        </div>
        <h3>{product.name}</h3>
        <p className="description">{product.description}</p>
        <div className="card-meta">
          <strong>
            ₹
            {product.price.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span aria-label={`${product.rating} out of 5 stars`}>
            ★ {product.rating.toFixed(1)}
          </span>
        </div>
        <div className="card-footer">
          <code>{product.sku}</code>
          <span className={product.inStock ? "stock in" : "stock out"}>
            {product.inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
        <button type="button" className="primary-action add-cart" disabled={!product.inStock || !location || status === "loading"} onClick={() => void add()}>
          {status === "loading" ? "Finding variant…" : !location ? "Select location to add" : !product.inStock ? "Unavailable" : status === "added" ? "Added" : "Add to cart"}
        </button>
        {message ? <p role={status === "error" ? "alert" : "status"}>{message}</p> : null}
      </div>
    </article>
  );
}
